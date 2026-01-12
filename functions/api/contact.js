export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const { name, email, message } = body;

    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    await env.DB.prepare(
      "INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)"
    )
      .bind(name, email, message)
      .run();

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// (tuỳ chọn) Cho GET để kiểm tra nhanh: /api/contact
export async function onRequestGet() {
  return new Response(
    JSON.stringify({ ok: true, hint: "POST JSON to this endpoint" }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}
