output "method_id" {
  value = aws_api_gateway_method.options.id
}

output "integration_id" {
  value = aws_api_gateway_integration.options.id
}

output "integration_response_id" {
  value = aws_api_gateway_integration_response.options_200.id
}
