export async function onRequestPost({ request, env }) {
  try {
    // 1. Parse JSON body
    const body = await request.json();
    const { name, email, message } = body;

    // 2. Validate dữ liệu
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Insert vào D1
    const stmt = env.DB.prepare(
      "INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)"
    );

    await stmt.bind(name, email, message).run();

    // 4. Trả kết quả
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
