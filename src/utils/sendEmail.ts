import nodemailer from "nodemailer";

export const sendEmail = async (to: string, otp: string) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Mondal Electronics" <${process.env.EMAIL_USER}>`,
    to,
    subject: "OTP for Password Reset",
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color:#4169e1;">🔐 Mondal Electronics</h2>
        
        <p>You requested to reset your password.</p>
        
        <p>Your OTP is:</p>
        
        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 6px;
          color: #4169e1;
          margin: 20px 0;
        ">
          ${otp}
        </div>

        <p>This OTP is valid for 10 minutes.</p>

        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
};