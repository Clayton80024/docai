export default function TestClerkPage() {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Clerk Keys Verification</h1>
      
      <div className="space-y-4">
        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Publishable Key:</h2>
          {publishableKey ? (
            <div>
              <p className="text-sm text-gray-600 mb-1">Status: ✅ Set</p>
              <p className="font-mono text-xs break-all">
                {publishableKey.substring(0, 30)}...
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Full length: {publishableKey.length} characters
              </p>
            </div>
          ) : (
            <p className="text-red-600">❌ NOT SET</p>
          )}
        </div>

        <div className="p-4 border rounded">
          <h2 className="font-semibold mb-2">Secret Key:</h2>
          {secretKey ? (
            <div>
              <p className="text-sm text-gray-600 mb-1">Status: ✅ Set</p>
              <p className="font-mono text-xs break-all">
                {secretKey.substring(0, 30)}...
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Full length: {secretKey.length} characters
              </p>
            </div>
          ) : (
            <p className="text-red-600">❌ NOT SET</p>
          )}
        </div>

        <div className="p-4 border rounded bg-yellow-50">
          <h2 className="font-semibold mb-2">Key Verification:</h2>
          {publishableKey && secretKey ? (
            <div>
              <p className="text-sm mb-2">
                ✅ Both keys are set in environment variables
              </p>
              <p className="text-sm mb-2">
                {publishableKey.startsWith('pk_test_') && secretKey.startsWith('sk_test_') 
                  ? '✅ Both are test keys (pk_test_ and sk_test_)'
                  : publishableKey.startsWith('pk_live_') && secretKey.startsWith('sk_live_')
                  ? '✅ Both are production keys (pk_live_ and sk_live_)'
                  : '⚠️ Key types do not match - this could be the problem!'}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                <strong>Important:</strong> If you're still experiencing the redirect loop,
                make sure both keys are from the <strong>same Clerk application instance</strong>.
                Go to your Clerk Dashboard → API Keys and verify they match.
              </p>
            </div>
          ) : (
            <p className="text-red-600">
              ❌ One or both keys are missing. Check your .env.local file.
            </p>
          )}
        </div>

        <div className="p-4 border rounded bg-blue-50">
          <h2 className="font-semibold mb-2">Next Steps:</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Verify both keys are from the same Clerk application in your dashboard</li>
            <li>Clear your browser cookies/cache (or use incognito mode)</li>
            <li>Restart your dev server: <code className="bg-gray-200 px-1 rounded">npm run dev</code></li>
            <li>Try accessing the app in a new incognito window</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

