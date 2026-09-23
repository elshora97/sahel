// Package storage puts uploaded files somewhere a browser can load them.
// Handlers depend on ObjectStore; production wires the MinIO/S3 client, tests
// wire an in-memory fake.
package storage

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// ObjectStore stores objects under a key. Put returns the public URL the
// browser will load; Delete takes that same URL back.
type ObjectStore interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (publicURL string, err error)
	Delete(ctx context.Context, publicURL string) error
}

// S3 is an ObjectStore backed by any S3-compatible server (MinIO locally).
type S3 struct {
	client     *minio.Client
	bucket     string
	publicBase string // no trailing slash
}

// NewS3 connects to endpoint (a URL such as http://minio:9000). publicBase is
// the browser-facing prefix for objects in bucket, e.g.
// http://localhost:9000/sahel-uploads. The two differ inside Docker.
func NewS3(endpoint, accessKey, secretKey, bucket, publicBase string) (*S3, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("S3 endpoint %q must be a URL like http://minio:9000", endpoint)
	}
	client, err := minio.New(u.Host, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: u.Scheme == "https",
	})
	if err != nil {
		return nil, fmt.Errorf("s3 client: %w", err)
	}
	return &S3{client: client, bucket: bucket, publicBase: strings.TrimRight(publicBase, "/")}, nil
}

// EnsureBucket creates the bucket if it's missing. Compose's minio-init does
// this in dev; tests call it directly.
func (s *S3) EnsureBucket(ctx context.Context) error {
	exists, err := s.client.BucketExists(ctx, s.bucket)
	if err != nil {
		return fmt.Errorf("bucket exists: %w", err)
	}
	if exists {
		return nil
	}
	return s.client.MakeBucket(ctx, s.bucket, minio.MakeBucketOptions{})
}

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (string, error) {
	if _, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{ContentType: contentType}); err != nil {
		return "", fmt.Errorf("put %s: %w", key, err)
	}
	return s.publicBase + "/" + key, nil
}

func (s *S3) Delete(ctx context.Context, publicURL string) error {
	key, ok := strings.CutPrefix(publicURL, s.publicBase+"/")
	if !ok || key == "" {
		return fmt.Errorf("%q is not an object in this bucket", publicURL)
	}
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("delete %s: %w", key, err)
	}
	return nil
}
