# Keep Web Audio behind a deep AudioEngine

The page will send complete amp settings and user commands through one `AudioEngine` interface and receive status and meter snapshots in return. Media capture, device and channel routing, Web Audio node topology, DSP, monitoring, and recovery stay inside the module rather than being manipulated by DOM code; this concentrates browser-audio complexity behind one testable seam and prevents the simple interface from becoming coupled to its implementation.
