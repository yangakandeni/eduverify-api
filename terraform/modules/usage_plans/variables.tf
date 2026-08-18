variable "name_prefix" {
  type = string
}

variable "api_id" {
  type = string
}

variable "stage_name" {
  type = string
}

variable "quota_limit" {
  type    = number
  default = 100000
}

variable "rate_limit" {
  type    = number
  default = 50
}

variable "burst_limit" {
  type    = number
  default = 20
}

variable "api_keys" {
  description = "API keys to create and attach to the usage plan. Manually maintained per the v1 decision to issue keys by hand rather than build self-serve signup."
  type = list(object({
    name = string
    tier = string
  }))
  default = []
}

variable "tags" {
  type    = map(string)
  default = {}
}
