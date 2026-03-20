"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePAN = exports.validateGST = void 0;
const validateGST = (gst) => {
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstRegex.test(gst);
};
exports.validateGST = validateGST;
const validatePAN = (pan) => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    return panRegex.test(pan);
};
exports.validatePAN = validatePAN;
