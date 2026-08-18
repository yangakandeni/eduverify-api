output "role_arn" {
  description = "ARN of the IAM role GitHub Actions assumes via OIDC. Set as the AWS_ROLE_ARN environment variable for the matching GitHub Environment (staging/production) that cd-staging.yml/cd-production.yml run under."
  value       = aws_iam_role.github_actions_deploy.arn
}
