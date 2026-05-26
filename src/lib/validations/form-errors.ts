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
  generic:              "Something went wrong. Please try again.",
  rateLimited:          "Too many attempts. Please wait a moment before trying again.",

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
} as const;

export type FormError = (typeof formErrors)[keyof typeof formErrors];
