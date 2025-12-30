import fs from "fs";
import path from "path";
import assert from "assert";
import type { AgentContextBase } from "../src/agents/types";
import {
  fastPathRetailMessage,
  postValidateRetailAction,
  sanitizeAction,
} from "../src/agents/retailAgent";

type Fixture = {
  id: string;
  type: "fast-path" | "post-validate" | "manual";
  text: string;
  ctx?: Record<string, unknown>;
  reply?: string;
  action?: Record<string, unknown>;
  expect?: {
    actionType: string;
    intent?: string;
    replyContains?: string[];
  };
};

const fixturePath = path.join(
  __dirname,
  "..",
  "fixtures",
  "retail-conversation-fixtures.json"
);

const raw = fs.readFileSync(fixturePath, "utf-8");
const data = JSON.parse(raw) as { fixtures: Fixture[] };

const baseCtx: AgentContextBase = {
  text: "",
  patientName: null,
  patientPhone: "",
  doctorName: "Demo Store",
  doctorId: 1,
  timezone: "America/Argentina/Buenos_Aires",
  availableSlots: [],
  recentMessages: [],
  patientProfile: {
    consultReason: null,
    pendingSlotISO: null,
    pendingSlotHumanLabel: null,
    pendingSlotExpiresAt: null,
    pendingSlotReason: null,
    dni: null,
    birthDate: null,
    address: null,
    needsDni: false,
    needsName: false,
    needsBirthDate: false,
    needsAddress: false,
    needsInsurance: false,
    needsConsultReason: false,
    preferredDayISO: null,
    preferredDayLabel: null,
    preferredHourMinutes: null,
    preferredDayHasAvailability: null,
  },
  doctorProfile: {
    specialty: null,
    clinicName: null,
    officeAddress: null,
    officeCity: null,
    officeMapsUrl: null,
    officeDays: null,
    officeHours: null,
    contactPhone: null,
    consultationPrice: null,
    emergencyConsultationPrice: null,
    additionalNotes: null,
  },
};

const lower = (v: string) => v.toLowerCase();

const ensureContains = (reply: string, parts: string[]) => {
  const haystack = lower(reply);
  for (const part of parts) {
    assert.ok(
      haystack.includes(lower(part)),
      `Expected reply to include "${part}". Got: ${reply}`
    );
  }
};

const runFastPath = (fixture: Fixture) => {
  const ctx = {
    ...baseCtx,
    text: fixture.text,
    ...(fixture.ctx || {}),
  } as AgentContextBase;

  const result = fastPathRetailMessage(ctx);
  assert.ok(result, `Fixture ${fixture.id} expected fast-path result.`);

  assert.strictEqual(
    result.action?.type,
    fixture.expect?.actionType,
    `Fixture ${fixture.id} actionType mismatch.`
  );

  if (fixture.expect?.intent) {
    assert.strictEqual(
      (result.action as any)?.intent,
      fixture.expect.intent,
      `Fixture ${fixture.id} intent mismatch.`
    );
  }

  if (fixture.expect?.replyContains?.length) {
    ensureContains(result.replyToPatient, fixture.expect.replyContains);
  }
};

const runPostValidate = (fixture: Fixture) => {
  const ctx = {
    ...baseCtx,
    text: fixture.text,
    ...(fixture.ctx || {}),
  } as AgentContextBase;

  const reply = fixture.reply || "";
  const action = sanitizeAction(fixture.action || {});
  const result = postValidateRetailAction(ctx, reply, action);

  assert.strictEqual(
    result.action?.type,
    fixture.expect?.actionType,
    `Fixture ${fixture.id} actionType mismatch.`
  );

  if (fixture.expect?.intent) {
    assert.strictEqual(
      (result.action as any)?.intent,
      fixture.expect.intent,
      `Fixture ${fixture.id} intent mismatch.`
    );
  }

  if (fixture.expect?.replyContains?.length) {
    ensureContains(result.reply, fixture.expect.replyContains);
  }
};

const fixtures = Array.isArray(data.fixtures) ? data.fixtures : [];

let passed = 0;
let manual = 0;
for (const fixture of fixtures) {
  if (fixture.type === "fast-path") {
    runFastPath(fixture);
  } else if (fixture.type === "post-validate") {
    runPostValidate(fixture);
  } else if (fixture.type === "manual") {
    assert.ok(fixture.text, `Fixture ${fixture.id} missing text.`);
    manual += 1;
    continue;
  } else {
    throw new Error(`Unknown fixture type: ${fixture.type}`);
  }
  passed += 1;
}

// eslint-disable-next-line no-console
console.log(`Retail fixtures OK: ${passed} passed, ${manual} manual`);
