package http

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/sahel/api/internal/store/postgres/db"
)

const maxImageBytes = 10 << 20

// imageExt is the upload MIME allowlist (spec §3.3), keyed by the sniffed
// type, never the client-declared one.
var imageExt = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

func (s *Server) adminUploadUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 60*time.Second)
	defer cancel()

	// Check the unit before accepting bytes so a typo'd id can't orphan an object.
	if _, err := s.queries.AdminGetUnit(ctx, unitID); err != nil {
		s.writeStoreError(w, err, "unit")
		return
	}

	const multipartOverhead = 1 << 20
	if r.ContentLength > maxImageBytes+multipartOverhead {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "images are limited to 10 MB")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes+multipartOverhead)
	file, hdr, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_upload", `expected a multipart field named "file"`)
		return
	}
	defer file.Close()
	if hdr.Size > maxImageBytes {
		writeError(w, http.StatusRequestEntityTooLarge, "file_too_large", "images are limited to 10 MB")
		return
	}

	head := make([]byte, 512)
	n, err := io.ReadFull(file, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid_upload", "could not read the file")
		return
	}
	mime := http.DetectContentType(head[:n])
	ext, ok := imageExt[mime]
	if !ok {
		writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "only JPEG, PNG and WebP images are accepted")
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.internalError(w, err, "image upload")
		return
	}

	key := fmt.Sprintf("units/%s/%s.%s", uuidString(unitID), uuidString(newUUID()), ext)
	url, err := s.store.Put(ctx, key, mime, file, hdr.Size)
	if err != nil {
		s.internalError(w, err, "image upload")
		return
	}

	img, err := inTx(ctx, s, func(q *db.Queries) (db.UnitImage, error) {
		if _, err := q.AdminLockUnit(ctx, unitID); err != nil {
			return db.UnitImage{}, err
		}
		return q.AdminCreateUnitImage(ctx, db.AdminCreateUnitImageParams{UnitID: unitID, Url: url})
	})
	if err != nil {
		s.deleteObject(url)
		s.writeStoreError(w, err, "unit")
		return
	}
	writeJSON(w, http.StatusCreated, img)
}

type imageInput struct {
	AltAr   field[string] `json:"alt_ar"`
	AltEn   field[string] `json:"alt_en"`
	Sort    field[int16]  `json:"sort"`
	IsCover field[bool]   `json:"is_cover"`
}

func (in imageInput) apply(img *db.UnitImage) error {
	var p problems
	setNullable(&img.AltAr, in.AltAr)
	setNullable(&img.AltEn, in.AltEn)
	setField(&p, &img.Sort, in.Sort, "sort")
	setField(&p, &img.IsCover, in.IsCover, "is_cover")
	blankToNil(&img.AltAr)
	blankToNil(&img.AltEn)
	if img.Sort < 0 {
		p.add("sort must be >= 0")
	}
	return p.err()
}

// adminPatchUnitImage edits alt text and sort, and moves the cover. Setting
// is_cover=true clears the previous cover in the same transaction (spec §4.3).
func (s *Server) adminPatchUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	imageID, ok := parseID(w, r, "imageId", "image")
	if !ok {
		return
	}
	var in imageInput
	if !decodeJSON(w, r, &in) {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()

	var invalid error
	img, err := inTx(ctx, s, func(q *db.Queries) (db.UnitImage, error) {
		if _, err := q.AdminLockUnit(ctx, unitID); err != nil {
			return db.UnitImage{}, err
		}
		img, err := q.AdminGetUnitImage(ctx, db.AdminGetUnitImageParams{ID: imageID, UnitID: unitID})
		if err != nil {
			return db.UnitImage{}, err
		}
		if invalid = in.apply(&img); invalid != nil {
			return db.UnitImage{}, invalid
		}
		if img.IsCover {
			if err := q.AdminClearUnitCover(ctx, db.AdminClearUnitCoverParams{UnitID: unitID, KeepID: imageID}); err != nil {
				return db.UnitImage{}, err
			}
		}
		return q.AdminUpdateUnitImage(ctx, db.AdminUpdateUnitImageParams{
			ID: imageID, AltAr: img.AltAr, AltEn: img.AltEn, Sort: img.Sort, IsCover: img.IsCover,
		})
	})
	switch {
	case invalid != nil:
		writeInvalid(w, invalid)
	case errors.Is(err, pgx.ErrNoRows):
		writeError(w, http.StatusNotFound, "not_found", "image not found")
	case err != nil:
		s.writeStoreError(w, err, "image")
	default:
		writeJSON(w, http.StatusOK, img)
	}
}

func (s *Server) adminDeleteUnitImage(w http.ResponseWriter, r *http.Request) {
	unitID, ok := parseID(w, r, "id", "unit")
	if !ok {
		return
	}
	imageID, ok := parseID(w, r, "imageId", "image")
	if !ok {
		return
	}
	ctx, cancel := contextWithTimeout(r, 5*time.Second)
	defer cancel()
	url, err := s.queries.AdminDeleteUnitImage(ctx, db.AdminDeleteUnitImageParams{ID: imageID, UnitID: unitID})
	if err != nil {
		s.writeStoreError(w, err, "image")
		return
	}
	s.deleteObject(url)
	w.WriteHeader(http.StatusNoContent)
}

// deleteObject removes an object best-effort. The DB row is already gone
// (or never landed), so a failure here only leaves an orphan for Phase 7's
// cleanup job. It's logged, never surfaced.
func (s *Server) deleteObject(url string) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := s.store.Delete(ctx, url); err != nil {
		s.log.Warn().Err(err).Str("url", url).Msg("orphaned object")
	}
}
