import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { username, password } = await request.json();

  const validUser = process.env.APP_USERNAME || "stefi";
  const validPass = process.env.APP_PASSWORD || "profesoara";

  if (username === validUser && password === validPass) {
    const response = NextResponse.json({ ok: true });
    response.cookies.set("session", "valid", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 zile
    });
    return response;
  }

  return NextResponse.json(
    { ok: false, error: "Nume sau parolă greșite." },
    { status: 401 }
  );
}
