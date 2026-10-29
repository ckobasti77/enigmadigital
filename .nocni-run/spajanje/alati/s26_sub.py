"""Zamene u fajlu bez obzira na kraj reda (CRLF/LF se čuva)."""
import io, sys
class Fajl:
    def __init__(self, p):
        self.p = p
        raw = io.open(p, encoding='utf-8', newline='').read()
        self.crlf = '\r\n' in raw
        self.s = raw.replace('\r\n', '\n')
    def sub(self, a, b, n=1):
        c = self.s.count(a)
        assert c == n, (self.p, a[:80], c)
        self.s = self.s.replace(a, b)
    def save(self):
        out = self.s.replace('\n', '\r\n') if self.crlf else self.s
        io.open(self.p, 'w', encoding='utf-8', newline='').write(out)
