# Web Serial Monitor

This context describes the language used for a browser-based monitor that receives NMEA-0183 data from a serial GNSS receiver.

## Language

**NMEA Sentence**:
A single text line in NMEA-0183 format, such as `$GNRMC,...*hh`. A NMEA Sentence is complete only after a line ending is received, whether that ending arrives as CRLF or LF.
_Avoid_: Packet

**Receive Chunk**:
A fragment of decoded text delivered by the serial stream. One Receive Chunk may contain part of a NMEA Sentence, one complete NMEA Sentence, or multiple NMEA Sentences.
_Avoid_: Packet fragment, raw packet

**Receive Log**:
The time-ordered collection of recent NMEA Sentences shown to the user. Each log entry may include a received-at timestamp, but the NMEA Sentence text remains unmodified.
_Avoid_: Packet list, terminal output

**Baud Rate**:
The serial line speed selected when opening a receiver connection. A mismatched Baud Rate can turn valid receiver output into unreadable text.
_Avoid_: Speed, frequency

## Example Dialogue

Dev: "The receiver delivered a Receive Chunk that ends halfway through a line. Should we add it to the Receive Log?"

Domain expert: "No. Keep buffering Receive Chunks until a complete NMEA Sentence is available, then append that sentence to the Receive Log."
