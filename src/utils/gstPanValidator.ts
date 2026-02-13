export const validateGST = (gst: string): boolean => {

  const gstRegex =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  return gstRegex.test(gst);
};

export const validatePAN = (pan: string): boolean => {

  const panRegex =
    /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  return panRegex.test(pan);
};
