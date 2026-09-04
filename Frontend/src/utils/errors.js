// Extracts a readable message from an axios error response.
export function apiErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (data?.errors?.length) return data.errors[0];
  if (error?.code === "ERR_NETWORK") {
    return "Cannot reach the server. Check that the backend is running.";
  }
  if (error?.code === "ECONNABORTED") {
    return "The request timed out. Please try again.";
  }
  return fallback;
}
