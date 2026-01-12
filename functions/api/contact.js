export async function onRequestGet({ request, env }) {
  try {
    // 1) Simple token auth via query: /api/contacts?token=...
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    const expected = env.ADMIN_TOKEN;

    // Nếu chưa set ADMIN_TOKEN trên Pages, cứ tạm bỏ auth bằng cách comment khối này.
    if (expected && token !== expected) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // 2) Read latest contacts
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") || "50", 10) || 50,
      200
    );

    const { results } = await env.DB.prepare(
      "SELECT id, name, email, message, created_at FROM contacts ORDER BY id DESC LIMIT ?"
    )
      .bind(limit)
      .all();

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
