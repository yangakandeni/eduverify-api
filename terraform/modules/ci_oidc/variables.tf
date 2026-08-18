variable "project_name" {
  description = "Short project slug this stack's resources are named with (e.g. \"eduverify-api-staging\"), used to scope this role's permissions to only the resources this stack creates."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository allowed to assume this role, as \"owner/repo\"."
  type        = string
}

variable "github_deploy_refs" {
  description = "Git refs (e.g. \"refs/heads/main\") whose GitHub Actions runs may assume this role. A workflow_dispatch run's OIDC token `sub` claim is repo:<owner>/<repo>:ref:<ref>, matched against these."
  type        = list(string)
}

variable "tf_state_bucket_name" {
  description = "Name of the S3 bucket holding this environment's Terraform remote state (shared with eduverify's data-stack, per environments/*.backend.hcl), so the CI role can read/write state objects."
  type        = string
}

variable "tf_lock_table_name" {
  description = "Name of the DynamoDB table used for Terraform state locking."
  type        = string
}

variable "tags" {
  description = "Tags applied to the IAM role."
  type        = map(string)
  default     = {}
}
