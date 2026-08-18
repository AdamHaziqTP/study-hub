import { supabase } from "@/lib/supabase";

export default async function TestDB() {
  // Try to grab 1 row from the studies table
  const { data, error } = await supabase
    .from("studies")
    .select("*")
    .limit(1);

  return (
    <div className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-4">Database Connection Test</h1>
      
      {error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <p><strong>Connection Error:</strong></p>
          <pre className="mt-2 text-sm">{JSON.stringify(error, null, 2)}</pre>
        </div>
      ) : (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative">
          <p><strong>Connection Successful! ✅</strong></p>
          <p className="mt-2">Next.js is successfully talking to your Supabase PostgreSQL database.</p>
          <p className="mt-2 text-sm text-gray-800">Rows found: {data?.length} (This should be 0 since the table is empty)</p>
        </div>
      )}
    </div>
  );
}