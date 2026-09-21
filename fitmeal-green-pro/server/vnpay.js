import crypto from 'node:crypto';
import querystring from 'node:querystring';
import { config } from './config.js';

function sortObject(input) {
  return Object.keys(input).sort().reduce((out, key) => {
    out[key] = input[key];
    return out;
  }, {});
}

export function toVnpDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

function sign(input) {
  const sorted = sortObject(input);
  const signData = querystring.stringify(sorted, { encode: false });
  return crypto.createHmac('sha512', config.vnpay.hashSecret).update(Buffer.from(signData, 'utf8')).digest('hex');
}

export function buildPaymentUrl({ txnRef, amount, orderInfo, ipAddr }) {
  if (!config.vnpay.tmnCode || !config.vnpay.hashSecret) {
    throw new Error('VNPAY chưa được cấu hình. Hãy điền VNPAY_TMN_CODE và VNPAY_HASH_SECRET trong .env.');
  }
  const now = new Date();
  const expire = new Date(now.getTime() + config.vnpay.expireMinutes * 60_000);
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: config.vnpay.tmnCode,
    vnp_Amount: Math.round(amount * 100),
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: config.vnpay.orderType,
    vnp_Locale: config.vnpay.locale,
    vnp_ReturnUrl: config.vnpay.returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: toVnpDate(now),
    vnp_ExpireDate: toVnpDate(expire)
  };
  const secureHash = sign(params);
  return `${config.vnpay.paymentUrl}?${querystring.stringify({ ...params, vnp_SecureHash: secureHash })}`;
}

export function verifyResponse(raw) {
  const params = { ...raw };
  const received = String(params.vnp_SecureHash || '');
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;
  if (!received || !config.vnpay.hashSecret) return false;
  const expected = sign(params);
  return crypto.timingSafeEqual(Buffer.from(received, 'utf8'), Buffer.from(expected, 'utf8'));
}
