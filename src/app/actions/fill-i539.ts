"use server";

import { readFile } from "fs/promises";
import { join } from "path";
import { currentUser } from "@clerk/nextjs/server";
import { PDFDocument } from "pdf-lib";
import { aggregateApplicationData } from "@/lib/application-data-aggregator";
import type { AggregatedApplicationData } from "@/lib/application-data-aggregator";
import { sanitizeForPdf } from "@/lib/pdf/sanitizeForPdf";

/**
 * Fontes dos dados do I-539 (detalhes em public/i-539/FONTES-DADOS-I539.md):
 * - Nome, DOB, país, passaporte, nacionalidade, gênero, validade → extração de Passport (documents.passport)
 * - I-94 number, data de admissão, classe, validade do status → extração de I-94 (documents.i94)
 * - Escola, SEVIS, datas do programa → extração de I-20 (documents.i20)
 * - Endereço (Street, City, State, ZIP) → formulário da aplicação (formData.currentAddress)
 * - E-mail → Clerk (user.email). Nome (fallback) → Clerk ou passport/i94/i20
 */

// Opção C: priorizar I-539 em AcroForm para preenchimento automático.
// Ordem: i-539-acroform.pdf (local) → I-539 AcroForm remoto (URL) → pdfRest API → i-539.pdf → USCIS.
const I539_USCIS_URL = "https://www.uscis.gov/sites/default/files/document/forms/i-539.pdf";
// AcroForm já convertido (ex.: pdfRest pdf-with-acroforms). Override: I539_ACROFORM_URL no .env.
const I539_ACROFORM_URL =
  process.env.I539_ACROFORM_URL ||
  "https://vwisbhxkzmithizzadny.supabase.co/storage/v1/object/public/forms/i-539%20(13)_pdfrest_pdf-with-acroforms.pdf";
const PDFREST_ACROFORMS = "https://api.pdfrest.com/pdf-with-acroforms";
const PDFREST_STATUS = "https://api.pdfrest.com/request-status";

/** Retorna o I-539 em XFA (i-539.pdf local ou download USCIS). */
async function getI539XfaBytes(): Promise<Uint8Array> {
  try {
    const p = join(process.cwd(), "public", "i-539", "i-539.pdf");
    return new Uint8Array(await readFile(p));
  } catch (e: any) {
    if (e?.code !== "ENOENT") throw e;
  }
  const res = await fetch(I539_USCIS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Fetch I-539 failed");
  return new Uint8Array(await res.arrayBuffer());
}

/** Converte XFA→AcroForm via pdfRest. Requer PDFREST_API_KEY. Retorna null em falha. */
async function pdfRestXfaToAcroforms(pdfBytes: Uint8Array): Promise<Uint8Array | null> {
  const key = process.env.PDFREST_API_KEY;
  if (!key?.trim()) return null;
  try {
    const form = new FormData();
    const buf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
    form.append("file", new Blob([buf], { type: "application/pdf" }), "i-539.pdf");

    const res = await fetch(PDFREST_ACROFORMS, {
      method: "POST",
      headers: { Accept: "application/json", "Api-Key": key },
      body: form,
    });
    const json = (await res.json()) as { outputUrl?: string; requestId?: string };

    const fetchOutput = async (url: string) => {
      const r = await fetch(url, { headers: { "Api-Key": key } });
      if (!r.ok) return null;
      return new Uint8Array(await r.arrayBuffer());
    };

    if (json.outputUrl) return await fetchOutput(json.outputUrl);

    // Modo assíncrono: poll request-status
    if (json.requestId) {
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const st = await fetch(`${PDFREST_STATUS}/${json.requestId}`, {
          headers: { Accept: "application/json", "Api-Key": key },
        });
        const sj = (await st.json()) as { outputUrl?: string };
        if (sj.outputUrl) return await fetchOutput(sj.outputUrl);
        if (st.status !== 202) break;
      }
    }
    return null;
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[pdfRestXfaToAcroforms]", e);
    return null;
  }
}

async function getI539PdfBytes(): Promise<Uint8Array> {
  // 1) AcroForm local (i-539-acroform.pdf)
  try {
    const p = join(process.cwd(), "public", "i-539", "i-539-acroform.pdf");
    return new Uint8Array(await readFile(p));
  } catch (e: any) {
    if (e?.code !== "ENOENT" && process.env.NODE_ENV === "development")
      console.warn("[getI539PdfBytes] i-539-acroform.pdf:", (e as Error)?.message);
  }

  // 2) AcroForm remoto (ex.: Supabase – I-539 já convertido com pdfRest pdf-with-acroforms)
  try {
    const res = await fetch(I539_ACROFORM_URL, { cache: "no-store" });
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length > 0) {
        if (process.env.NODE_ENV === "development") console.log("[getI539PdfBytes] AcroForm remoto OK");
        return buf;
      }
    }
  } catch (e) {
    if (process.env.NODE_ENV === "development") console.warn("[getI539PdfBytes] AcroForm remoto:", (e as Error)?.message);
  }

  // 3) pdfRest API: XFA→AcroForm em tempo real (requer PDFREST_API_KEY)
  if (process.env.PDFREST_API_KEY) {
    const xfa = await getI539XfaBytes();
    const acro = await pdfRestXfaToAcroforms(xfa);
    if (acro && acro.length > 0) {
      if (process.env.NODE_ENV === "development") console.log("[getI539PdfBytes] pdfRest: XFA→AcroForm OK");
      return acro;
    }
  }

  // 4) XFA local ou USCIS (overlay/blank)
  return getI539XfaBytes();
}

function toUSCISDate(s: string | undefined): string {
  if (!s || !s.trim()) return "";
  try {
    const d = new Date(s.trim());
    if (isNaN(d.getTime())) return s;
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const y = d.getFullYear();
    return `${m}/${day}/${y}`;
  } catch {
    return s;
  }
}

function parseFullName(data: AggregatedApplicationData): { family: string; given: string; middle: string } {
  const raw =
    data.documents.passport?.name ||
    data.documents.i94?.name ||
    data.documents.i20?.studentName ||
    data.user.fullName ||
    [data.user.lastName, data.user.firstName].filter(Boolean).join(" ") ||
    "";
  const parts = String(raw).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { family: "", given: "", middle: "" };
  if (parts.length === 1) return { family: parts[0], given: "", middle: "" };
  const family = parts[parts.length - 1];
  const given = parts[0];
  const middle = parts.length > 2 ? parts.slice(1, -1).join(" ") : "";
  return { family, given, middle };
}

// ——— AcroForm (Opção C): preenche campos quando o PDF é i-539-acroform.pdf ———
type FieldLike = { name: string; setText?: (v: string) => void; check?: () => void; uncheck?: () => void };

function findField(
  flat: FieldLike[],
  possible: string[],
  excludeNameContains?: string[]
): FieldLike | undefined {
  let list = flat;
  if (excludeNameContains?.length) {
    const ex = excludeNameContains.map((e) => e.toLowerCase());
    list = flat.filter((f) => !ex.some((e) => f.name.toLowerCase().includes(e)));
  }
  const exact = list.find((f) => possible.includes(f.name));
  if (exact) return exact;
  return list.find((f) => possible.some((p) => f.name.includes(p) || p.includes(f.name)));
}

function buildFlat(form: { getTextField: (n: string) => { setText: (v: string) => void }; getCheckBox: (n: string) => { check: () => void; uncheck: () => void } }, fields: { getName: () => string }[]): FieldLike[] {
  const flat: FieldLike[] = [];
  for (const f of fields) {
    try {
      const n = f.getName();
      const c = (f as any).constructor?.name as string;
      if (c === "PDFTextField") {
        const tf = form.getTextField(n);
        flat.push({ name: n, setText: (v) => tf.setText(String(v ?? "").slice(0, 65535)) });
      } else if (c === "PDFCheckBox") {
        const cb = form.getCheckBox(n);
        flat.push({ name: n, check: () => cb.check(), uncheck: () => cb.uncheck() });
      } else if (c !== "PDFDropdown" && c !== "PDFRadioGroup") {
        try {
          const tf = form.getTextField(n);
          flat.push({ name: n, setText: (v) => tf.setText(String(v ?? "").slice(0, 65535)) });
        } catch {
          // não é text field (ex. dropdown/radio); ignora
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.warn("[fillI539] skip field", (f as any)?.getName?.(), e);
    }
  }
  return flat;
}

function applyAcroFormFill(
  flat: FieldLike[],
  data: {
    name: { family: string; given: string; middle: string };
    addr: { street: string; city: string; state: string; zipCode: string } | undefined;
    passport: AggregatedApplicationData["documents"]["passport"];
    i94: AggregatedApplicationData["documents"]["i94"];
    i20: AggregatedApplicationData["documents"]["i20"];
    country: string | undefined;
    user?: { email?: string };
  }
): void {
  const { name, addr, passport, i94, i20, country, user } = data;
  const c = country ?? "";

  // Regras de texto: nomes possíveis (p01_num_XXX, pdfRest, Adobe, rótulos I-539). Ordem: mais específico primeiro.
  // excludeNameContains: evita que o número do I-94 seja colocado em "In Care Of" ou em campos de endereço.
  const textRules: { possible: string[]; value: string; excludeNameContains?: string[] }[] = [
    { possible: ["p01_num_001", "FamilyName", "Family Name", "LastName", "1a", "Family", "Line1a", "Last Name"], value: name.family },
    { possible: ["p01_num_002", "GivenName", "Given Name", "FirstName", "1b", "Given", "Line1b", "First Name"], value: name.given },
    { possible: ["p01_num_003", "MiddleName", "Middle Name", "1c", "Middle", "Line1c", "if applicable"], value: name.middle },
    { possible: ["In Care Of", "InCareOf", "p01_num_006", "4a", "CareOf"], value: "" },
    { possible: ["p01_num_007", "Street", "Street Number and Name", "StreetNumber", "4b", "Line4_Street", "StreetNumber"], value: addr?.street ?? "" },
    { possible: ["p01_num_008", "Apt", "AptSteFlr", "4c", "Apt. Ste. Flr", "Ste", "Flr"], value: "" },
    { possible: ["p01_num_009", "City", "City or Town", "4d", "CityOrTown", "Line4_City"], value: addr?.city ?? "" },
    { possible: ["p01_num_010", "State", "4e", "Line4_State"], value: addr?.state ?? "" },
    { possible: ["p01_num_011", "ZIP", "ZIPCode", "4f", "ZIP Code", "Line4_ZIP"], value: addr?.zipCode ?? "" },
    { possible: ["p01_num_017", "CountryOfBirth", "Country of Birth", "6", "CoBirth", "Line6", "Item6", "Part1_6"], value: passport?.placeOfBirth ?? c },
    { possible: ["p01_num_018", "CountryOfCitizenship", "Country of Citizenship", "Nationality", "7", "Line7", "Citizenship", "Item7", "Part1_7"], value: passport?.nationality ?? c },
    { possible: ["p01_num_019", "DateOfBirth", "Date of Birth", "8", "DOB", "Line8", "Item8", "Part1_8", "Date of Birth (mm"], value: toUSCISDate(passport?.dateOfBirth ?? i20?.dateOfBirth) },
    { possible: ["p01_num_021", "DateOfLastArrival", "Date of Last Arrival", "10", "DateLastArrival", "Line10", "Last Arrival", "Item10", "Part1_10", "Last Arrival Into the United States"], value: toUSCISDate(i94?.dateOfAdmission) },
    { possible: ["p01_num_022", "I94", "I-94", "I_94", "11", "AdmissionNumber", "AdmissionNo", "AdmNumber", "I94Number", "I94_Number", "Arrival-Departure", "Form I-94", "FormI94", "Item11", "Item_11", "Part1_11", "Pt1_11", "1.11"], value: i94?.admissionNumber ?? "", excludeNameContains: ["CareOf", "Care Of", "In Care Of", "InCareOf", "Mailing", "Street", "City", "State", "ZIP", "Apt", "Physical", "Address"] },
    { possible: ["p01_num_023", "PassportNumber", "Passport Number", "Passport No", "PassportNo", "Passport_Number", "PassportNum", "12", "Item12", "Item_12", "Part1_12", "Pt1_12", "Passport Number (if any)", "Passport(if any)", "Passport#", "Passport #", "Doc. No.", "DocNo", "Doc_No", "12 -"], value: passport?.passportNumber ?? (passport as any)?.extractedData?.passport_number ?? (passport as any)?.extractedData?.document_number ?? (passport as any)?.extractedData?.doc_number ?? (passport as any)?.extractedData?.documentnumber ?? (passport as any)?.extractedData?.passport_num ?? "", excludeNameContains: ["Expir", "Expiration", "Expiry", "Country", "14a", "14b"] },
    { possible: ["p01_num_025", "CountryOfPassport", "Country of Passport", "CountryPassport", "PassportCountry", "14a", "CoPassport", "Passport Issuance", "PassportIssuance", "Travel Document Issuance", "Item14a", "Part1_14a", "Pt1_14a", "Issuance"], value: passport?.nationality ?? c },
    { possible: ["p01_num_026", "PassportExpiration", "Passport Expiration", "14b", "Expiration", "Expiry", "Travel Document Expiration", "Passport or Travel Document Expiration", "Item14b", "Part1_14b", "Expiration Date (mm", "Validity"], value: toUSCISDate(passport?.expiryDate ?? (passport as any)?.extractedData?.expiry_date ?? (passport as any)?.extractedData?.expiration_date) },
    { possible: ["p01_num_027", "CurrentStatus", "Current Nonimmigrant Status", "CurrentStatus", "Nonimmigrant", "15a", "Status", "Item15a", "Item_15a", "Part1_15a", "Pt1_15a", "ClassOfAdmission"], value: i94?.classOfAdmission ?? "F-1" },
    { possible: ["p01_num_028", "StatusExpiration", "Date Status Expires", "StatusExpiration", "StatusExp", "DateExpires", "15b", "D/S", "Status Expires", "Item15b", "Item_15b", "Part1_15b", "Pt1_15b", "Date Status Expires (mm"], value: toUSCISDate(i94?.admitUntilDate) || "D/S" },
    { possible: ["p02_num_001", "ChangeTo", "Change to", "Changeto", "change my status", "requesting to change", "status or employer", "ToStatus", "RequestedStatus", "NewStatus", "F-1", "F1", "ToF1", "Pt2_1", "Part2_1"], value: "F-1" },
    { possible: ["p02_num_002", "EffectiveDate", "ChangeEffective", "Effective", "change to be effective", "effective date"], value: toUSCISDate(i20?.startDate) },
    { possible: ["p02_num_003", "TotalNumber", "Total number", "Total", "total number of people", "people (including"], value: "1" },
    { possible: ["p02_num_004", "SchoolName", "School", "name of the school", "school you will attend", "Institution", "University", "College", "NameOfSchool", "Pt2_4", "Part2_5", "Item_5", "Item5"], value: i20?.schoolName ?? "" },
    { possible: ["p02_num_005", "SEVIS", "SEVISID", "SEVIS ID", "SEVISNumber", "SEVIS_Number", "SevisId", "Sevis", "Student and Exchange Visitor", "Pt2_6", "Part2_6", "Item_6", "Item6"], value: i20?.sevisId ?? "" },
    { possible: ["p03_num_001", "ExtendUntil", "ExtensionUntil", "extended until", "extend until", "extended until (mm", "Part3_1", "Part3_Extend", "ExtensionDate", "UntilDate", "RequestedEnd", "Pt3_1"], value: toUSCISDate(i20?.endDate) },
    { possible: ["Applicant's Email", "Email Address", "Email", "Pt5_3", "5_3", "Part5_Email", "contact email"], value: user?.email ?? "" },
    { possible: ["Date of Signature", "DateOfSignature", "Signature Date", "SigDate", "DateSig", "SignDate", "Pt5_4", "5_4", "Part5_4", "Date of Signature (mm", "ApplicantDate", "Pt5Item4", "5.Item4"], value: toUSCISDate(new Date().toISOString()) },
    { possible: ["Daytime Telephone", "Daytime", "Telephone Number", "Phone", "Pt5_1", "5_1", "Applicant's Daytime"], value: "" },
    { possible: ["Mobile Telephone", "Mobile Number", "Mobile", "Pt5_2", "5_2", "Applicant's Mobile"], value: "" },
  ];

  let missingCount = 0;
  for (const r of textRules) {
    const f = findField(flat, r.possible, r.excludeNameContains);
    if (f?.setText) {
      try {
        f.setText(sanitizeForPdf(r.value));
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.warn("[fillI539] setText", f.name, e);
      }
    } else if (r.value && String(r.value).trim().length > 0 && process.env.NODE_ENV === "development") {
      missingCount++;
      console.warn("[fillI539] campo não encontrado (valor com", String(r.value).length, "chars). Possíveis:", r.possible.slice(0, 5).join(", "));
    }
  }
  if (missingCount > 0 && process.env.NODE_ENV === "development") {
    console.log("[fillI539] Nomes de todos os campos do PDF (para mapear):", flat.map((f) => f.name).join(", "));
  }

  const checkRules: { possible: string[]; checked: boolean }[] = [
    { possible: ["p02_chk_001", "ChangeOfStatus", "Change", "change of status", "A change of status"], checked: true },
    { possible: ["p02_chk_002", "Extension", "An extension", "extension of stay"], checked: false },
    { possible: ["p02_chk_003", "Reinstatement", "Reinstatement to student"], checked: false },
    { possible: ["p01_chk_003", "SameAsMailing", "MailingSamePhysical", "PhysicalSame", "same as your physical", "mailing address the same", "5. Yes", "Item5_Yes"], checked: true },
    { possible: ["OnlyApplicant", "Only applicant", "only applicant", "I am the only", "Item3_Only", "p02_chk_004", "3. I am the only"], checked: true },
  ];
  const g = (passport?.gender ?? "").toLowerCase();
  if (g === "m" || g === "male") checkRules.push({ possible: ["p01_chk_001", "Male", "Gender_M", "Gender", "M"], checked: true });
  if (g === "f" || g === "female") checkRules.push({ possible: ["p01_chk_002", "Female", "Gender_F", "F"], checked: true });

  for (const r of checkRules) {
    const f = findField(flat, r.possible);
    if (f && (f.check || f.uncheck)) {
      try {
        r.checked ? f.check?.() : f.uncheck?.();
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.warn("[fillI539] check", f.name, e);
      }
    }
  }
}

// Coordenadas aproximadas para overlay (fallback quando não há AcroForm) no I-539 oficial (XFA). Ordem visual típica; ajustar se a edição mudar.
// PDF: origem canto inferior esquerdo, y para cima. Página 0 = primeira página do form.
function buildOverlays(data: {
  name: { family: string; given: string; middle: string };
  addr: { street: string; city: string; state: string; zipCode: string } | undefined;
  passport: AggregatedApplicationData["documents"]["passport"];
  i94: AggregatedApplicationData["documents"]["i94"];
  i20: AggregatedApplicationData["documents"]["i20"];
  country: string | undefined;
}): { page: number; x: number; y: number; size: number; text: string }[] {
  const { name, addr, passport, i94, i20, country } = data;
  const c = country ?? "";
  const overlays: { page: number; x: number; y: number; size: number; text: string }[] = [];

  // Part 1 — página 0
  if (name.family) overlays.push({ page: 0, x: 72, y: 698, size: 10, text: name.family });
  if (name.given) overlays.push({ page: 0, x: 190, y: 698, size: 10, text: name.given });
  if (name.middle) overlays.push({ page: 0, x: 300, y: 698, size: 10, text: name.middle });

  if (addr?.street) overlays.push({ page: 0, x: 72, y: 658, size: 10, text: addr.street });
  if (addr?.city) overlays.push({ page: 0, x: 72, y: 638, size: 10, text: addr.city });
  if (addr?.state) overlays.push({ page: 0, x: 200, y: 638, size: 10, text: addr.state });
  if (addr?.zipCode) overlays.push({ page: 0, x: 280, y: 638, size: 10, text: addr.zipCode });

  const coBirth = passport?.placeOfBirth ?? c;
  if (coBirth) overlays.push({ page: 0, x: 72, y: 598, size: 10, text: coBirth });
  const coCit = passport?.nationality ?? c;
  if (coCit) overlays.push({ page: 0, x: 240, y: 598, size: 10, text: coCit });
  const dob = toUSCISDate(passport?.dateOfBirth ?? i20?.dateOfBirth);
  if (dob) overlays.push({ page: 0, x: 380, y: 598, size: 10, text: dob });

  const dateArr = toUSCISDate(i94?.dateOfAdmission);
  if (dateArr) overlays.push({ page: 0, x: 72, y: 576, size: 10, text: dateArr });
  if (i94?.admissionNumber) overlays.push({ page: 0, x: 200, y: 576, size: 10, text: i94.admissionNumber });

  if (passport?.passportNumber) overlays.push({ page: 0, x: 72, y: 554, size: 10, text: passport.passportNumber });
  const coPass = passport?.nationality ?? c;
  if (coPass) overlays.push({ page: 0, x: 220, y: 554, size: 10, text: coPass });
  const exp = toUSCISDate(passport?.expiryDate);
  if (exp) overlays.push({ page: 0, x: 360, y: 554, size: 10, text: exp });

  const status = i94?.classOfAdmission ?? "F-1";
  overlays.push({ page: 0, x: 72, y: 532, size: 10, text: status });
  const statusExp = toUSCISDate(i94?.admitUntilDate) || "D/S";
  overlays.push({ page: 0, x: 220, y: 532, size: 10, text: statusExp });

  // Part 2 — em muitas edições fica na página 1
  overlays.push({ page: 1, x: 72, y: 680, size: 10, text: "F-1" });
  const effDate = toUSCISDate(i20?.startDate);
  if (effDate) overlays.push({ page: 1, x: 220, y: 680, size: 10, text: effDate });
  overlays.push({ page: 1, x: 72, y: 658, size: 10, text: "1" });
  if (i20?.schoolName) overlays.push({ page: 1, x: 72, y: 636, size: 10, text: i20.schoolName });
  if (i20?.sevisId) overlays.push({ page: 1, x: 72, y: 614, size: 10, text: i20.sevisId });

  // Part 3 — extensão até
  const extUntil = toUSCISDate(i20?.endDate);
  if (extUntil) overlays.push({ page: 1, x: 72, y: 572, size: 10, text: extUntil });

  return overlays;
}

export async function fillI539FormAction(
  applicationId: string
): Promise<{ success: boolean; pdfBytes?: Uint8Array; error?: string; filled?: boolean }> {
  let pdfBytes: Uint8Array | undefined;
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Não autenticado." };

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data)
      return { success: false, error: error || "Dados da aplicação não encontrados." };

    pdfBytes = await getI539PdfBytes();
    const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });

    const name = parseFullName(data);
    const addr = data.application.currentAddress;
    const passport = data.documents.passport;
    const i94 = data.documents.i94;
    const i20 = data.documents.i20;
    const ctx = {
      name,
      addr,
      passport,
      i94,
      i20,
      country: data.application?.country,
      user: { email: data.user?.email },
    };

    // Opção C: se o PDF tem campos AcroForm, preenche por setText/check e devolve.
    const form = doc.getForm();
    const fields = form.getFields();
    const flat = buildFlat(form, fields);
    if (flat.length > 0) {
      if (process.env.NODE_ENV === "development") {
        console.log("[fillI539] AcroForm: preenchendo", flat.length, "campos. Nomes:", flat.map((f) => f.name).join(", "));
      }
      applyAcroFormFill(flat, ctx);
      const out = await doc.save({ updateFieldAppearances: false, useObjectStreams: false });
      return { success: true, pdfBytes: out, filled: true };
    }

    // Fallback: overlay (XFA costuma quebrar getPageCount; em caso de erro o catch devolve PDF em branco).
    const pageCount = doc.getPageCount();
    const overlays = buildOverlays(ctx);
    for (const o of overlays) {
      if (!o.text || o.page < 0 || o.page >= pageCount) continue;
      try {
        const page = doc.getPage(o.page);
        page.drawText(sanitizeForPdf(o.text), { x: o.x, y: o.y, size: o.size || 10 });
      } catch (e) {
        if (process.env.NODE_ENV === "development") console.warn("[fillI539] overlay", o.page, o.text?.slice(0, 20), e);
      }
    }
    const out = await doc.save();
    return { success: true, pdfBytes: out, filled: true };
  } catch (e: any) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fillI539] PDF com estrutura não suportada (XFA/refs inválidas). Devolvendo I-539 em branco.", (e as Error)?.message);
    }
    if (!pdfBytes) return { success: false, error: (e as Error)?.message || "Não foi possível obter o I-539." };
    return { success: true, pdfBytes, filled: false };
  }
}

// ——— Guia de preenchimento (HTML) ———
// Quando o pdf-lib não consegue editar o I-539, o usuário pode usar este guia para preencher à mão.

export async function getI539FillGuideAction(
  applicationId: string
): Promise<{ success: boolean; html?: string; error?: string }> {
  try {
    const user = await currentUser();
    if (!user) return { success: false, error: "Não autenticado." };

    const { success, data, error } = await aggregateApplicationData(applicationId);
    if (!success || !data)
      return { success: false, error: error || "Dados da aplicação não encontrados." };

    const name = parseFullName(data);
    const addr = data.application.currentAddress;
    const passport = data.documents.passport;
    const i94 = data.documents.i94;
    const i20 = data.documents.i20;
    const c = data.application?.country ?? "";

    const toDate = (s: string | undefined) => (s ? toUSCISDate(s) : "");

    const rows: [string, string][] = [
      ["1.a Family Name (Last Name)", name.family],
      ["1.b Given Name (First Name)", name.given],
      ["1.c Middle Name", name.middle],
      ["4.b Street Number and Name", addr?.street ?? ""],
      ["4.d City or Town", addr?.city ?? ""],
      ["4.e State", addr?.state ?? ""],
      ["4.f ZIP Code", addr?.zipCode ?? ""],
      ["6. Country of Birth", passport?.placeOfBirth ?? c],
      ["7. Country of Citizenship or Nationality", passport?.nationality ?? c],
      ["8. Date of Birth (mm/dd/yyyy)", toDate(passport?.dateOfBirth ?? i20?.dateOfBirth)],
      ["10. Date of Last Arrival", toDate(i94?.dateOfAdmission)],
      ["11. I-94 Arrival-Departure Record Number", i94?.admissionNumber ?? ""],
      ["12. Passport Number", passport?.passportNumber ?? ""],
      ["14.a Country of Passport Issuance", passport?.nationality ?? c],
      ["14.b Passport Expiration Date (mm/dd/yyyy)", toDate(passport?.expiryDate)],
      ["15.a Current Nonimmigrant Status", i94?.classOfAdmission ?? "F-1"],
      ["15.b Expiration of Current Status (or D/S)", toDate(i94?.admitUntilDate) || "D/S"],
      ["Part 2 – Requested change to (e.g. F-1)", "F-1"],
      ["Part 2 – Effective date", toDate(i20?.startDate)],
      ["Part 2 – Total number in group", "1"],
      ["Part 2 – School name", i20?.schoolName ?? ""],
      ["Part 2 – SEVIS ID", i20?.sevisId ?? ""],
      ["Part 3 – Requested extension until", toDate(i20?.endDate)],
    ];

    const tds = rows.map(([label, val]) => `<tr><td style="padding:6px 12px;border:1px solid #ddd;">${escapeHtml(label)}</td><td style="padding:6px 12px;border:1px solid #ddd;font-weight:600;">${escapeHtml(val || "—")}</td></tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>I-539 – Guia de preenchimento</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:24px auto;padding:0 16px;">
<h1 style="font-size:1.25rem;">I-539 – Guia de preenchimento</h1>
<p style="color:#555;">Use esta tabela para preencher o formulário I-539 manualmente em <a href="https://www.uscis.gov/i-539">uscis.gov/i-539</a>.</p>
<table style="width:100%;border-collapse:collapse;margin-top:16px;">
<thead><tr style="background:#f5f5f5;"><th style="padding:8px 12px;border:1px solid #ddd;text-align:left;">Campo</th><th style="padding:8px 12px;border:1px solid #ddd;text-align:left;">Valor</th></tr></thead>
<tbody>${tds}</tbody>
</table>
<p style="margin-top:24px;font-size:0.9rem;color:#666;">Gerado pelo DocAI. Baixe o I-539 em branco, preencha com os valores acima e assine.</p>
</body>
</html>`;

    return { success: true, html };
  } catch (e: any) {
    return { success: false, error: (e as Error)?.message || "Erro ao gerar o guia." };
  }
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
