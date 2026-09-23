package storage

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
	tcminio "github.com/testcontainers/testcontainers-go/modules/minio"
)

func newTestStore(t *testing.T) *S3 {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Same image compose runs: Docker Hub no longer serves new minio/minio
	// pulls, so reuse the one the dev stack already has locally.
	c, err := tcminio.Run(ctx, "minio/minio:latest")
	if err != nil {
		t.Skipf("testcontainers unavailable (%v)", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })

	hostPort, err := c.ConnectionString(ctx)
	if err != nil {
		t.Fatalf("connection string: %v", err)
	}
	s, err := NewS3("http://"+hostPort, c.Username, c.Password, "test-bucket", "http://cdn.test/test-bucket/")
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	if err := s.EnsureBucket(ctx); err != nil {
		t.Fatalf("EnsureBucket: %v", err)
	}
	return s
}

func TestS3_PutThenDelete(t *testing.T) {
	s := newTestStore(t)
	ctx := context.Background()

	url, err := s.Put(ctx, "units/abc/1.png", "image/png", strings.NewReader("pngbytes"), 8)
	if err != nil {
		t.Fatalf("Put: %v", err)
	}
	if url != "http://cdn.test/test-bucket/units/abc/1.png" {
		t.Fatalf("url = %q", url)
	}

	info, err := s.client.StatObject(ctx, "test-bucket", "units/abc/1.png", minio.StatObjectOptions{})
	if err != nil {
		t.Fatalf("stat after put: %v", err)
	}
	if info.ContentType != "image/png" || info.Size != 8 {
		t.Fatalf("stored %s / %d bytes", info.ContentType, info.Size)
	}

	if err := s.Delete(ctx, url); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.client.StatObject(ctx, "test-bucket", "units/abc/1.png", minio.StatObjectOptions{}); err == nil {
		t.Fatal("object still exists after Delete")
	}
}

func TestS3_DeleteRejectsForeignURL(t *testing.T) {
	s, err := NewS3("http://localhost:9000", "k", "s", "b", "http://cdn.test/b")
	if err != nil {
		t.Fatalf("NewS3: %v", err)
	}
	if err := s.Delete(context.Background(), "http://elsewhere.test/b/x.png"); err == nil {
		t.Fatal("want error for a URL outside this bucket")
	}
}

func TestNewS3_RejectsBareHost(t *testing.T) {
	if _, err := NewS3("minio:9000", "k", "s", "b", "http://cdn.test/b"); err == nil {
		t.Fatal("want error for endpoint without scheme")
	}
}
