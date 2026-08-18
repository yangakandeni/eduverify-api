output "bucket_id" {
  description = "Name/ID of the S3 bucket."
  value       = aws_s3_bucket.registers.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket."
  value       = aws_s3_bucket.registers.arn
}

output "bucket_name" {
  description = "Name of the S3 bucket."
  value       = aws_s3_bucket.registers.bucket
}
