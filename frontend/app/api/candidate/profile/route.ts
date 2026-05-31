import { NextRequest, NextResponse } from 'next/server';

const FIREBASE_PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!;
const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY!;

// Use Firebase REST API instead of SDK to avoid server-side initialization issues
async function firestoreGet(uid: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/candidateProfiles/${uid}?key=${FIREBASE_API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore GET failed: ${err.slice(0, 200)}`);
  }
  const json = await res.json();
  return firestoreDocToObject(json);
}

async function firestoreSet(uid: string, data: Record<string, unknown>) {
  const url = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/candidateProfiles/${uid}?key=${FIREBASE_API_KEY}`;
  const body = { fields: objectToFirestoreFields(data) };
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore SET failed: ${err.slice(0, 200)}`);
  }
  return true;
}

// Convert JS object to Firestore fields format
function objectToFirestoreFields(obj: unknown): Record<string, unknown> {
  if (Array.isArray(obj)) {
    return {
      arrayValue: {
        values: obj.map(item => valueToFirestore(item)),
      },
    } as unknown as Record<string, unknown>;
  }
  if (obj !== null && typeof obj === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      fields[key] = valueToFirestore(val);
    }
    return fields;
  }
  return {};
}

function valueToFirestore(val: unknown): unknown {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') return { doubleValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(valueToFirestore) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = valueToFirestore(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Convert Firestore document to plain JS object
function firestoreDocToObject(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = doc.fields as Record<string, unknown>;
  if (!fields) return {};
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    result[key] = firestoreValueToJS(val as Record<string, unknown>);
  }
  return result;
}

function firestoreValueToJS(val: Record<string, unknown>): unknown {
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('doubleValue' in val) return val.doubleValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = val.arrayValue as { values?: unknown[] };
    return (arr.values || []).map(v => firestoreValueToJS(v as Record<string, unknown>));
  }
  if ('mapValue' in val) {
    const map = val.mapValue as { fields?: Record<string, unknown> };
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(map.fields || {})) {
      obj[k] = firestoreValueToJS(v as Record<string, unknown>);
    }
    return obj;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const uid = req.headers.get('x-user-uid');
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const data = await firestoreGet(uid);
    return NextResponse.json(data || {});
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[GET /api/candidate/profile]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = req.headers.get('x-user-uid');
  if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    await firestoreSet(uid, { ...body, updatedAt: new Date().toISOString() });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PUT /api/candidate/profile]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
