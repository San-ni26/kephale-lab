import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import * as jwt from 'jsonwebtoken';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  }
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private connectedUsers = new Map<string, string>(); // socketId -> userId

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }
      
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('JWT_SECRET not configured');
      const decoded = jwt.verify(token, secret) as { userId: string };
      this.connectedUsers.set(client.id, decoded.userId);
      
      // Join a room specific to the user for direct messages
      client.join(`user_${decoded.userId}`);
      // Ne pas logger le userId — information personnelle inutile dans les logs
    } catch (e) {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedUsers.delete(client.id);
  }

  // Emits an event to a specific user's room
  sendToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_${userId}`).emit(event, payload);
  }

  // This can be used for typing indicators, etc.
  @SubscribeMessage('typing')
  handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { targetUserId: string, conversationId: string }) {
    const senderId = this.connectedUsers.get(client.id);
    if (senderId) {
      this.sendToUser(data.targetUserId, 'typing', { senderId, conversationId: data.conversationId });
    }
  }
}
