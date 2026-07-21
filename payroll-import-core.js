(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.KlaarPayrollCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function clean(value) {
    return String(value ?? "")
      .replace(/\u00a0/g, " ")
      .trim();
  }

  function norm(value) {
    return clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function compact(value) {
    return norm(value).replace(/\s+/g, "");
  }

  function toNumber(value) {
    if (typeof value === "number")
      return Number.isFinite(value) ? Math.round(value) : 0;
    let text = clean(value);
    if (!text) return 0;
    text = text
      .replace(/\(([^)]*)\)/g, "-$1")
      .replace(/[^0-9,.\-]/g, "");
    if (!/\d/.test(text)) return 0;
    const negative = /-/.test(text);
    text = text.replace(/-/g, "");
    const decimalIndex = Math.max(
      text.lastIndexOf(","),
      text.lastIndexOf("."),
    );
    let integerPart = text;
    let fraction = "";
    if (decimalIndex > -1) {
      const after = text.slice(decimalIndex + 1);
      if (/^\d{1,2}$/.test(after)) {
        integerPart = text.slice(0, decimalIndex);
        fraction = after;
      }
    }
    integerPart = integerPart.replace(/[.,]/g, "");
    const parsed = Number.parseFloat(
      integerPart + (fraction ? "." + fraction : ""),
    );
    if (!Number.isFinite(parsed)) return 0;
    return Math.round(negative ? -parsed : parsed);
  }

  function semanticComponentKey(name) {
    return norm(name)
      .replace(/\b(tunjangan|tunj|tj|potongan|pot|biaya|anak)\b/g, " ")
      .replace(/\b(kesehatan|tenaga kerja|ketenagakerjaan)\b/g, " $1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function quantityKindForHeader(header, headers, sourceIndex = -1) {
    const key = semanticComponentKey(header);
    const words = key.split(" ").filter((word) => word.length > 2);
    let best = null;
    (headers || []).forEach((candidate, index) => {
      if (index === sourceIndex) return;
      const normalized = norm(candidate);
      if (!/tunj|pot|gaji|insentif|subsidi|beasiswa|bpjs/.test(normalized))
        return;
      const candidateKey = semanticComponentKey(candidate);
      const hits = words.filter((word) => candidateKey.includes(word)).length;
      if (!hits) return;
      const score = hits * 10 + (/pot|iuran/.test(normalized) ? 2 : 1);
      if (!best || score > best.score) {
        best = {
          index,
          header: candidate,
          kind: /pot|iuran/.test(normalized) ? "deduction" : "allowance",
          score,
        };
      }
    });
    return (
      best || {
        index: -1,
        header: "",
        kind: /day care|daycare/.test(norm(header))
          ? "deduction"
          : "allowance",
        score: 0,
      }
    );
  }

  function evaluateQuantityColumn({
    header,
    headers,
    sourceIndex = -1,
    value,
    rate,
  }) {
    const quantity = toNumber(value);
    const unitRate = toNumber(rate);
    const linked = quantityKindForHeader(header, headers, sourceIndex);
    const operational =
      /hadir|telat|terlambat|sakit|izin|alpha|alpa|tanpa ket|tugas|\btgs\b|hari libur|hr\.?\s*libur|day\s*care|eskul|ekskul|futsal|renang|pramuka|musrif|musyrif|jam|malam|makan|lembur|shift|kegiatan/i.test(
        clean(header),
      );
    const safelyLinked = linked.index >= 0 && linked.score >= 10;
    const validQuantity =
      unitRate > 0 &&
      Number.isInteger(quantity) &&
      quantity >= 0 &&
      Math.abs(quantity) <= 1000;
    if (!validQuantity)
      return { recognized: false, active: false, quantity, rate: unitRate };
    if (!safelyLinked && !operational) {
      return {
        recognized: true,
        active: false,
        unresolved: true,
        quantity,
        rate: unitRate,
        amount: 0,
        resultHeader: "",
        reason:
          "Angka kecil punya tarif tetapi tidak memiliki pasangan kolom hasil yang pasti.",
      };
    }
    const operationalDeduction =
      /telat|terlambat|sakit|izin|alpha|alpa|tanpa ket|day\s*care/i.test(
        clean(header),
      );
    return {
      recognized: true,
      active: safelyLinked,
      unresolved: false,
      quantity,
      rate: unitRate,
      // Nominal hanya informatif. Parser snapshot wajib tetap memakai kolom
      // rupiah resmi Excel dan tidak menyuntikkan hasil ini sebagai Rp1/Rp2.
      amount: quantity * unitRate,
      kind: safelyLinked
        ? linked.kind
        : operationalDeduction
          ? "deduction"
          : "allowance",
      resultHeader: linked.header || "",
      confidence: safelyLinked ? linked.score : 80,
    };
  }

  function classifyImportedComponent(name) {
    const normalized = norm(name);
    if (/koreksi|selisih|penyesuaian/.test(normalized)) return "monthly";
    if (
      /thr|bonus|rapel|lembur|overtime|insentif|honor kegiatan|honor.*jam|jam mengajar|\bjtm\b/.test(
        normalized,
      )
    )
      return "monthly";
    if (/pinjaman|cicilan|angsuran|kasbon/.test(normalized))
      return "installment";
    if (/bpjs|jht|jkk|jkm|jaminan pensiun|pph|pajak/.test(normalized))
      return "statutory";
    if (/hadir|kehadiran|absen|alpha|alpa|telat|terlambat/.test(normalized))
      return "attendance";
    if (
      /gaji pokok|gapok|fungsional|(?:tunjangan|tunj|tj).*rumah|masa kerja/.test(
        normalized,
      )
    )
      return "rule";
    return "fixed";
  }

  function reconcilePayroll({ gross, deductions, correction, net }) {
    const excelGross = toNumber(gross);
    const excelDeductions = Math.abs(toNumber(deductions));
    const excelCorrection = toNumber(correction);
    const excelNet = toNumber(net);
    const calculatedNet = excelGross - excelDeductions + excelCorrection;
    return {
      gross: excelGross,
      deductions: excelDeductions,
      correction: excelCorrection,
      net: excelNet,
      calculatedNet,
      delta: excelNet - calculatedNet,
      exact: excelNet === calculatedNet,
    };
  }

  function attendanceAllowance({
    hadir = 0,
    telat = 0,
    workDays = 24,
    fullAmount = 0,
    dailyRate = 0,
  }) {
    const attended = Math.max(0, toNumber(hadir) + toNumber(telat));
    const days = Math.max(1, toNumber(workDays) || 24);
    const full = Math.max(0, toNumber(fullAmount));
    const daily = Math.max(0, toNumber(dailyRate));
    if (attended >= days && full) return full;
    return Math.round((daily || (full ? full / days : 0)) * attended);
  }

  return Object.freeze({
    clean,
    norm,
    compact,
    toNumber,
    semanticComponentKey,
    quantityKindForHeader,
    evaluateQuantityColumn,
    classifyImportedComponent,
    reconcilePayroll,
    attendanceAllowance,
  });
});
