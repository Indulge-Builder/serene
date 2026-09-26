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
  elayaNotEnabled:      "Elaya is not switched on for your team yet.",
  rateLimited:          "Too many attempts. Please wait a moment before trying again.",

  // Password reset
  passwordMismatch:         "Passwords do not match.",
  resetLinkInvalid:         "This reset link is invalid or has already been used.",
  resetLinkExpired:         "This reset link has expired. Please request a new one.",
  otpInvalid:               "That code is invalid or has expired. Please request a new one.",

  // Profile / user creation
  fullNameRequired:     "Full name is required.",
  fullNameTooLong:      "Full name must be 100 characters or fewer.",
  passwordTooLong:      "Password must be 72 characters or fewer.",
  roleInvalid:          "Please select a valid role.",
  domainInvalid:        "Please select a valid domain.",
  siaRoleInvalid:       "Please select a valid position for this domain.",
  siaRoleDomain:        "Positions and queendoms only apply to the Concierge domain.",
  queendomRequired:     "Please choose the queendom this person works in.",
  siaRolePlatformMismatch: "That position sets its own access level; it cannot be changed by hand.",
  seatTaken:            "That seat is already held by an active member of this queendom.",
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

  // Voice note transcription
  audioRequired:        "No recording was captured. Please try again.",
  audioTooLarge:        "Recording is too large. Keep voice notes under two minutes.",
  audioInvalidType:     "That recording format isn't supported. Please try again.",
  transcriptionFailed:  "Couldn't transcribe the recording. Please try again or type the note.",

  // Elaya
  elayaMessageInvalid:  "Please write a message before sending.",
  elayaMessageTooLong:  "Messages must be 4,000 characters or fewer.",
  elayaCapReached:      "You've reached today's Elaya message limit. It resets at midnight.",
  elayaUnavailable:     "Elaya couldn't respond just now. Please try again.",

  // Suggestion box / bug report
  suggestionMessageRequired:  "Please write a message before sending.",
  suggestionMessageTooLong:   "Message must be 2,000 characters or fewer.",
  suggestionImageTooLarge:    "Each image must be 5 MB or smaller.",
  suggestionImageInvalidType: "Please attach image files only (JPEG, PNG, WebP, etc.).",
  suggestionTooManyImages:    "You can attach up to 4 images.",
  suggestionUploadFailed:     "Image upload failed. Please check your connection and try again.",
  suggestionSubmitFailed:     "Couldn't send your feedback. Please try again.",

  // Password change
  passwordCurrentIncorrect: "Current password is incorrect.",
  passwordSameAsCurrent:    "New password must differ from your current password.",
  passwordConfirmMismatch:  "Passwords do not match.",
  passwordSessionExpired:   "Session expired. Please sign in again.",

  // Subscriptions & Bills Tracker
  subscriptionNameRequired:        "Please enter a subscription name.",
  subscriptionDepartmentRequired:  "Please select at least one department.",
  subscriptionTypeInvalid:         "Please select a billing type.",
  subscriptionCurrencyInvalid:     "Please select a currency.",
  subscriptionAmountInvalid:       "Please enter a valid amount.",
  subscriptionDueDayInvalid:       "Please enter a day of the month between 1 and 31.",
  subscriptionDueDateInvalid:      "Please select a due date.",
  subscriptionRateInvalid:         "Please enter the amount in the original currency.",
  subscriptionPaidAmountInvalid:   "Please enter the INR amount that was paid.",
  subscriptionInvoiceTooLarge:     "Invoice must be 8 MB or smaller.",
  subscriptionInvoiceInvalidType:  "Please attach a PDF, PNG, or JPG file.",
  subscriptionInvoiceUploadFailed: "Invoice upload failed. Please check your connection and try again.",
  subscriptionNotFound:            "Subscription not found.",
  subscriptionSaveFailed:          "Couldn't save the subscription. Please try again.",

  // Vendors
  vendorNameRequired:         "Please enter the vendor's name.",
  vendorNameTaken:            "A vendor with this name already exists.",
  vendorPhoneInvalid:         "Please enter a valid phone number.",
  vendorCategoryRequired:     "Please choose a category.",
  vendorStatusInvalid:        "Please choose a valid vendor status.",
  vendorStanceInvalid:        "Please choose Offers or Declines.",
  vendorPreferenceInvalid:    "Please choose Preferred or Avoid.",
  vendorOutcomeInvalid:       "Please choose an outcome.",
  vendorDateInvalid:          "Please enter a valid date and time.",
  vendorAmountInvalid:        "Please enter a valid INR amount.",
  vendorRatingInvalid:        "Ratings are 1 to 5.",
  vendorReviewEmpty:          "Add at least one rating or a comment.",
  vendorNotFound:             "Vendor not found.",
  vendorEngagementNotFound:   "Job not found.",
  vendorMergeSameRow:         "Pick a different vendor to merge in.",
  vendorMergeFailed:          "The vendors could not be merged. Nothing was changed.",
  vendorEngagementClosed:     "This job is already closed.",
  vendorEngagementMismatch:   "That job belongs to a different vendor.",
  vendorCapabilityNotFound:   "Capability not found.",
  vendorNothingToUpdate:      "Nothing to update.",
  vendorNoteRequired:         "Write something before adding the note.",
  vendorNoteTooLong:          "Note must be 4000 characters or fewer.",
  vendorSaveFailed:           "Couldn't save. Please try again.",
} as const;

export type FormError = (typeof formErrors)[keyof typeof formErrors];
