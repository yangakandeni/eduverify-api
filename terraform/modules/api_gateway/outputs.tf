output "api_id" {
  value = aws_api_gateway_rest_api.api.id
}

output "stage_name" {
  value = aws_api_gateway_stage.stage.stage_name
}

output "invoke_url" {
  value = aws_api_gateway_stage.stage.invoke_url
}

output "access_log_group_name" {
  value = aws_cloudwatch_log_group.access_logs.name
}
