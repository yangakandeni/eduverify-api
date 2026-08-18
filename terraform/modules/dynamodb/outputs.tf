output "table_name" {
  description = "Name of the DynamoDB table."
  value       = aws_dynamodb_table.institutions.name
}

output "table_arn" {
  description = "ARN of the DynamoDB table."
  value       = aws_dynamodb_table.institutions.arn
}

output "gsi1_arn" {
  description = "ARN of the GSI1 index, needed for IAM policies scoping Query access."
  value       = "${aws_dynamodb_table.institutions.arn}/index/GSI1"
}
