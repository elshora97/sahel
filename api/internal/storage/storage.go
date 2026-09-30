// Package storage puts uploaded files somewhere a browser can load them.
// Handlers depend on ObjectStore; production wires the S3 client, tests
// wire an in-memory fake.
package storage

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ObjectStore stores objects under a key. Put returns the public URL the
// browser will load; Delete takes that same URL back. PutPrivate and
// GetPrivate use a bucket nobody can read anonymously: payment receipts,
// which show bank details, only ever leave it through the API.
type ObjectStore interface {
	Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (publicURL string, err error)
	Delete(ctx context.Context, publicURL string) error
	PutPrivate(ctx context.Context, key, contentType string, body io.Reader, size int64) error
	GetPrivate(ctx context.Context, key string) (io.ReadCloser, error)
}

// S3 is an ObjectStore backed by any S3-compatible server: MinIO locally,
// Supabase Storage or Cloudflare R2 in production.
type S3 struct {
	client     *s3.Client
	bucket     string
	private    string // bucket without anonymous access: <bucket>-private
	publicBase string // no trailing slash
}

// NewS3 connects to endpoint (a URL such as http://minio:9000). The endpoint
// may carry a path, as Supabase's does: https://<ref>.supabase.co/storage/v1/s3.
// publicBase is the browser-facing prefix for objects in bucket, e.g.
// http://localhost:9000/sahel-uploads. The two differ inside Docker. region
// is the project's region on Supabase, "auto" on R2, anything on MinIO.
func NewS3(endpoint, region, accessKey, secretKey, bucket, publicBase string) (*S3, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return nil, fmt.Errorf("S3 endpoint %q must be a URL like http://minio:9000", endpoint)
	}
	if region == "" {
		region = "us-east-1"
	}
	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(strings.TrimRight(endpoint, "/")),
		Credentials:  credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		// MinIO and Supabase address buckets by path, not by subdomain.
		UsePathStyle: true,
		// Newer SDKs add CRC checksums some S3-compatible servers reject.
		RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired,
		ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired,
	})
	return &S3{client: client, bucket: bucket, private: bucket + "-private", publicBase: strings.TrimRight(publicBase, "/")}, nil
}

// EnsureBucket creates the public bucket if it's missing. Compose's
// minio-init does this in dev; tests call it directly.
func (s *S3) EnsureBucket(ctx context.Context) error { return s.ensure(ctx, s.bucket) }

// EnsurePrivateBucket creates the private bucket if it's missing. A new
// bucket has no anonymous policy, so nothing in it is publicly readable.
func (s *S3) EnsurePrivateBucket(ctx context.Context) error { return s.ensure(ctx, s.private) }

func (s *S3) ensure(ctx context.Context, bucket string) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{Bucket: aws.String(bucket)})
	if err == nil {
		return nil
	}
	var notFound *types.NotFound
	if !errors.As(err, &notFound) {
		return fmt.Errorf("bucket exists: %w", err)
	}
	if _, err := s.client.CreateBucket(ctx, &s3.CreateBucketInput{Bucket: aws.String(bucket)}); err != nil {
		return fmt.Errorf("create bucket %s: %w", bucket, err)
	}
	return nil
}

func (s *S3) put(ctx context.Context, bucket, key, contentType string, body io.Reader, size int64) error {
	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(bucket),
		Key:           aws.String(key),
		Body:          body,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
	})
	return err
}

func (s *S3) PutPrivate(ctx context.Context, key, contentType string, body io.Reader, size int64) error {
	if err := s.put(ctx, s.private, key, contentType, body, size); err != nil {
		return fmt.Errorf("put private %s: %w", key, err)
	}
	return nil
}

func (s *S3) GetPrivate(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.private), Key: aws.String(key)})
	if err != nil {
		return nil, fmt.Errorf("get private %s: %w", key, err)
	}
	return out.Body, nil
}

func (s *S3) Put(ctx context.Context, key, contentType string, body io.Reader, size int64) (string, error) {
	if err := s.put(ctx, s.bucket, key, contentType, body, size); err != nil {
		return "", fmt.Errorf("put %s: %w", key, err)
	}
	return s.publicBase + "/" + key, nil
}

func (s *S3) Delete(ctx context.Context, publicURL string) error {
	key, ok := strings.CutPrefix(publicURL, s.publicBase+"/")
	if !ok || key == "" {
		return fmt.Errorf("%q is not an object in this bucket", publicURL)
	}
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)}); err != nil {
		return fmt.Errorf("delete %s: %w", key, err)
	}
	return nil
}
