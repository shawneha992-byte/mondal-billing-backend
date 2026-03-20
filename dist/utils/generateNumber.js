"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePaymentNo = generatePaymentNo;
function generatePaymentNo(lastNo) {
    const year = new Date().getFullYear();
    if (!lastNo) {
        return `PIN-${year}-0001`;
    }
    const parts = lastNo.split("-");
    const seq = parseInt(parts[2]) + 1;
    return `PIN-${year}-${seq.toString().padStart(4, "0")}`;
}
