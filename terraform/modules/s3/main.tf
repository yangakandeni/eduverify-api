resource "aws_s3_bucket" "registers" {
  bucket = var.bucket_name
  tags   = var.tags
}

resource "aws_s3_bucket_versioning" "registers" {
  bucket = aws_s3_bucket.registers.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "registers" {
  bucket = aws_s3_bucket.registers.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "registers" {
  bucket = aws_s3_bucket.registers.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "registers" {
  bucket = aws_s3_bucket.registers.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}
