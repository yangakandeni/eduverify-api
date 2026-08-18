variable "bucket_name" {
  description = "Globally-unique name for the private registers bucket."
  type        = string
}

variable "tags" {
  description = "Tags applied to the bucket."
  type        = map(string)
  default     = {}
}
