output "function_name" {
  description = "Name of the Lambda function."
  value       = aws_lambda_function.ingestion.function_name
}

output "function_arn" {
  description = "ARN of the Lambda function."
  value       = aws_lambda_function.ingestion.arn
}

output "ecr_repository_url" {
  description = "Push target for the ingestion container image (see main.tf's bootstrap-order comment)."
  value       = aws_ecr_repository.ingestion.repository_url
}
