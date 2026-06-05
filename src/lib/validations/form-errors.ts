/**
 * All user-facing form error messages.
 * Never let a raw Zod message reach the UI — always map through here.
 */
export const formErrors = {
  // Auth
  required:             "This field is required.",
  email:                "Please enter a valid email address.",
  passwordTooShort:     "Password must be at least 8 characters.",
  invalidCredentials:   "The email or password you entered is incorrect.",
  accountDeactivated:   "Your account has been deactivated. Please contact your administrator.",
  generic:              "Something went wrong. Please try again.",
  rateLimited:          "Too many attempts. Please wait a moment before trying again.",

  // Password reset
  passwordMismatch:         "Passwords do not match.",
  resetLinkInvalid:         "This reset link is invalid or has already been used.",
  resetLinkExpired:         "This reset link has expired. Please request a new one.",

  // Profile / user creation
  fullNameRequired:     "Full name is required.",
  fullNameTooLong:      "Full name must be 100 characters or fewer.",
  passwordTooLong:      "Password must be 72 characters or fewer.",
  roleInvalid:          "Please select a valid role.",
  domainInvalid:        "Please select a valid domain.",
  jobTitleTooLong:      "Job title must be 100 characters or fewer.",
  usernameTooShort:     "Username must be at least 3 characters.",
  usernameTooLong:      "Username must be 30 characters or fewer.",
  usernameInvalidChars: "Username may only contain lowercase letters, numbers, and underscores.",
  usernameUnavailable:  "That username is already taken.",
  emailUnavailable:     "An account with this email already exists.",
  unauthorized:         "You don't have permission to perform this action.",
  userNotFound:         "User not found.",
  phoneInvalid:         "Please enter a valid phone number.",

  // Avatar upload
  avatarTooLarge:       "Image must be 2 MB or smaller.",
  avatarInvalidType:    "Please select an image file (JPEG, PNG, WebP, etc.).",
  avatarUploadFailed:   "Upload failed. Please check your connection and try again.",
  avatarProfileFailed:  "Image uploaded but profile update failed. Please try again.",

  // Password change
  passwordCurrentIncorrect: "Current password is incorrect.",
  passwordSameAsCurrent:    "New password must differ from your current password.",
  passwordConfirmMismatch:  "Passwords do not match.",
  passwordSessionExpired:   "Session expired. Please sign in again.",
} as const;

export type FormError = (typeof formErrors)[keyof typeof formErrors];
