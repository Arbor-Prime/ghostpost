import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SocketContext = createContext(null);

const EVENT_TYPES = [
  'scan:started',
  'scan:tweets_found',
  'scan:completed',
  'opportunity:scored',
  'draft:generated',
  'draft:status_changed',
  'reply:delayed',
  'reply:posting',
  'reply:posted',
  'reply:failed',
  'browser:cookies-captured',
];

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [events, setEvents] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const s = io(window.location.origin, { transports: ['websocket', 'polling'] });

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    EVENT_TYPES.forEach(type => {
      s.on(type, (data) => {
        setEvents(prev => [{ type, data, timestamp: new Date() }, ...prev].slice(0, 100));
      });
    });

    setSocket(s);
    return () => s.disconnect();
  }, []);

  return (
    <SocketContext.Provider value={{ socket, events, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export const useSocket = () => useContext(SocketContext);
