#!/usr/bin/env python3
"""ATEM-Simulator zum Testen ohne Gerät. Benimmt sich im Netz wie ein ATEM Mini.

Aufruf:  python3 atem_simulator.py                 auf 127.0.0.1:9910
         python3 atem_simulator.py --art neu       ohne leere Pakete nach dem Start, wie der ATEM Mini Pro mit Zeitcode
         python3 atem_simulator.py --verlust 0.2   verliert jedes fünfte Startpaket
         python3 atem_simulator.py --bytes         zeigt jeden Befehl als Bytes

In der App als ATEM-Adresse 127.0.0.1 eintragen.
"""
import argparse, random, socket, struct, time

ACK_REQ, HELLO, RESEND, REQ_NEXT, ACK = 0x01, 0x02, 0x04, 0x08, 0x10


def kopf(flags, laenge, sitzung, gegen=0, eigene=0):
    return struct.pack('>HHHHHH', (flags << 11) | laenge, sitzung, gegen, 0, 0, eigene)


def befehl(name, daten):
    return struct.pack('>HH', 8 + len(daten), 0) + name.encode() + daten


class Sim:
    def __init__(self, a):
        self.a = a
        self.s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.s.bind((a.adresse, 9910))
        self.s.settimeout(0.05)
        self.gegen = None
        self.sitzung = 0
        self.id = 0
        self.gesendet = {}
        self.programm, self.vorschau = 1, 2
        self.letzter_ping = 0
        self.blende_bis = 0
        self.modus_start = 0

    def paket(self, koerper=b'', flags=ACK_REQ, verlieren=False):
        self.id += 1
        p = kopf(flags, 12 + len(koerper), self.sitzung, eigene=self.id) + koerper
        self.gesendet[self.id] = p
        if not verlieren:
            self.s.sendto(p, self.gegen)

    def startdaten(self):
        namen = ['HDMI 1', 'HDMI 2', 'HDMI 3', 'HDMI 4']
        teile = [befehl('_ver', struct.pack('>HH', 2, 30)),
                 befehl('_pin', b'ATEM Mini Simulator'.ljust(44, b'\0')),
                 befehl('_top', bytes([1, 14, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0]))]
        for i, n in enumerate(namen):
            d = struct.pack('>H', i + 1) + n.encode().ljust(20, b'\0') + ('C%d' % (i + 1)).encode().ljust(4, b'\0') + bytes(10)
            teile.append(befehl('InPr', d.ljust(36, b'\0')))
        # Interne Quelle (Anschlussart 1): darf nicht als Eingang erscheinen
        d = struct.pack('>H', 1000) + b'Color Bars'.ljust(20, b'\0') + b'Bars' + bytes(4) + bytes([1]) + bytes(5)
        d = d[:30] + bytes([1]) + d[31:]
        teile.append(befehl('InPr', d.ljust(36, b'\0')))
        teile += [befehl('PrgI', struct.pack('>BBH', 0, 0, self.programm)), befehl('PrvI', struct.pack('>BBH4x', 0, 0, self.vorschau))]
        for i, t in enumerate(teile):
            self.paket(t, verlieren=random.random() < self.a.verlust and i > 0)
        self.paket(befehl('InCm', bytes(4)))
        if self.a.art == 'alt':
            self.paket()   # leeres Paket: Startdaten vollständig
        print('Startdaten gesendet: %d Pakete, Sitzung 0x%04x' % (self.id, self.sitzung), flush=True)

    def melde_programm(self):
        self.paket(befehl('PrgI', struct.pack('>BBH', 0, 0, self.programm)) + befehl('PrvI', struct.pack('>BBH4x', 0, 0, self.vorschau)))

    def lauf(self):
        print('ATEM-Simulator auf %s:9910, Art: %s' % (self.a.adresse, self.a.art), flush=True)
        while True:
            try:
                d, von = self.s.recvfrom(2048)
                self.empfang(d, von)
            except socket.timeout:
                pass
            jetzt = time.time()
            if self.gegen and self.sitzung and jetzt - self.letzter_ping > 0.5:
                self.letzter_ping = jetzt
                if self.a.art == 'neu':
                    self.paket(befehl('Time', bytes(8)))
                else:
                    self.paket()
            if self.blende_bis and jetzt >= self.blende_bis:
                self.blende_bis = 0
                self.programm, self.vorschau = self.vorschau, self.programm
                print('Blende fertig, Programm %d' % self.programm, flush=True)
                self.melde_programm()

    def empfang(self, d, von):
        if len(d) < 12:
            return
        wort, sitzung, gegen, r1, r2, eigene = struct.unpack('>HHHHHH', d[:12])
        flags, laenge = wort >> 11, wort & 0x7FF
        if flags & HELLO:
            print('Anmeldung von %s: %s' % (von, d.hex()), flush=True)
            self.gegen, self.sitzung, self.id, self.gesendet = von, 0, 0, {}
            self.s.sendto(kopf(HELLO, 20, sitzung) + bytes([2, 0, 0, 7, 0, 0, 0, 0]), von)
            self.hello_ack_offen = True
            return
        if flags & ACK and getattr(self, 'hello_ack_offen', False):
            self.hello_ack_offen = False
            print('Anmeldung bestätigt: %s' % d.hex(), flush=True)
            self.sitzung = 0x8000 | random.randint(1, 0x7FFF)
            self.startdaten()
            return
        if flags & REQ_NEXT:
            fehlend = r1 + 1
            p = self.gesendet.get(fehlend)
            print('Nachforderung Paket %d' % fehlend, flush=True)
            if p:
                w = struct.unpack('>H', p[:2])[0] | (RESEND << 11)
                self.s.sendto(struct.pack('>H', w) + p[2:], von)
            return
        if flags & ACK_REQ:
            self.s.sendto(kopf(ACK, 12, self.sitzung, gegen=eigene), von)
        i = 12
        while i + 8 <= min(laenge, len(d)):
            l = struct.unpack('>H', d[i:i + 2])[0]
            name = d[i + 4:i + 8].decode('latin1')
            daten = d[i + 8:i + l]
            if self.a.bytes:
                print('Paket %s' % d.hex(), flush=True)
            print('Befehl %s %s' % (name, daten.hex()), flush=True)
            if name == 'CPgI':
                self.programm = struct.unpack('>H', daten[2:4])[0]
                self.melde_programm()
            elif name == 'CPvI':
                self.vorschau = struct.unpack('>H', daten[2:4])[0]
                self.melde_programm()
            elif name == 'CTMx':
                self.bilder = daten[1]
            elif name == 'DAut':
                self.blende_bis = time.time() + getattr(self, 'bilder', 25) / 25
            elif name == 'DCut':
                self.programm, self.vorschau = self.vorschau, self.programm
                self.melde_programm()
            i += max(l, 8)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--adresse', default='127.0.0.1')
    p.add_argument('--art', choices=['alt', 'neu'], default='alt')
    p.add_argument('--verlust', type=float, default=0)
    p.add_argument('--bytes', action='store_true')
    try:
        Sim(p.parse_args()).lauf()
    except KeyboardInterrupt:
        pass
