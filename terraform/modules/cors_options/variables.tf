variable "rest_api_id" {
  type = string
}

variable "resource_id" {
  type = string
}

variable "allowed_methods" {
  description = "Comma-separated methods for the Access-Control-Allow-Methods header, e.g. \"GET,OPTIONS\"."
  type        = string
}
