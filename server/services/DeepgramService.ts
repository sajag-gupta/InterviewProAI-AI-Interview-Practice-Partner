import { createClient, LiveTranscriptionEvents, type ListenLiveClient } from "@deepgram/sdk";
import type { Socket } from "socket.io";
import type { ClientToServerEvents, ServerToClientEvents } from "@shared/schema";
import { config } from "../config";

type VoiceSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, any>;

/**
 * Live speech to text. The browser streams compressed audio (MediaRecorder), Deepgram sends back
 * interim and final segments, and we forward them untouched. The user reviews the text before it is
 * sent as an answer, so nothing here decides when an answer is "done".
 *
 * `keyterms` are per-session words the model should recognise (the candidate's name, skills from their
 * job description). Nothing is hard-coded.
 */
export class DeepgramService {
  private client: ReturnType<typeof createClient>;
  private connections = new Map<string, ListenLiveClient>();

  constructor() {
    if (!config.DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY is not set. Add it to .env to use voice mode.");
    this.client = createClient(config.DEEPGRAM_API_KEY);
  }

  start(socket: VoiceSocket, keyterms: string[]): void {
    this.stop(socket.id);

    const connection = this.client.listen.live({
      model: config.DEEPGRAM_MODEL,
      language: config.DEEPGRAM_LANGUAGE,
      smart_format: true,
      punctuate: true,
      interim_results: true,
      filler_words: true,
      endpointing: 800,
      keyterm: keyterms.slice(0, 40),
    });
    this.connections.set(socket.id, connection);

    connection.on(LiveTranscriptionEvents.Open, () => socket.emit("voice_ready"));

    connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const text: string = data.channel?.alternatives?.[0]?.transcript?.trim();
      if (!text) return;
      socket.emit(data.is_final ? "final_transcript" : "interim_transcript", text);
    });

    connection.on(LiveTranscriptionEvents.Error, (error) => {
      console.error(`[Deepgram] ${socket.id}:`, error);
      socket.emit("error", "Speech recognition failed. Check your Deepgram key and try again.");
    });

    connection.on(LiveTranscriptionEvents.Close, () => this.connections.delete(socket.id));
  }

  send(socketId: string, audio: Buffer): void {
    const connection = this.connections.get(socketId);
    if (connection?.getReadyState() === 1) connection.send(audio);
  }

  stop(socketId: string): void {
    this.connections.get(socketId)?.requestClose();
    this.connections.delete(socketId);
  }
}
