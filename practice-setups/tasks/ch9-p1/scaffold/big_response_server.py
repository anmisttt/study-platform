# big_response_server.py — serves a fixed 10 MB body on GET /
#!/usr/bin/env python3
from http.server import HTTPServer, BaseHTTPRequestHandler

BODY = b"x" * 10_000_000


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Length", str(len(BODY)))
        self.end_headers()
        self.wfile.write(BODY)


if __name__ == "__main__":
    HTTPServer(("0.0.0.0", 8080), H).serve_forever()
