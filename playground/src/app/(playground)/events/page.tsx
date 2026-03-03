'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { useEventStream } from '@/hooks/use-event-stream';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JsonViewer } from '@/components/playground/json-viewer';
import { Trash2 } from 'lucide-react';

const API = '/api/emai/events';

function eventColor(event: string): string {
  if (event.startsWith('email:')) return 'bg-blue-100 text-blue-800';
  if (event.startsWith('safety:')) return 'bg-red-100 text-red-800';
  if (event.startsWith('watch:')) return 'bg-green-100 text-green-800';
  return 'bg-gray-100 text-gray-800';
}

export default function EventsPage() {
  const [folder, setFolder] = useState('inbox');
  const [pollInterval, setPollInterval] = useState('30000');
  const startWatch = useEmaiExecute(API, 'startWatch');
  const stopWatch = useEmaiExecute(API, 'stopWatch');
  const watchStatus = useEmaiExecute(API, 'watchStatus');

  const { events, isConnected, clear } = useEventStream();
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  return (
    <>
      <Header title="Events & Watch" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl">
        <MethodExecutor
          title="Watch Controls"
          description="Start/stop watching for new emails (IMAP IDLE or polling)"
          loading={startWatch.loading || stopWatch.loading}
          error={startWatch.error || stopWatch.error}
          data={startWatch.data || stopWatch.data || watchStatus.data}
          duration={startWatch.duration || stopWatch.duration}
          onExecute={() =>
            startWatch.execute({
              folder,
              pollInterval: Number(pollInterval),
            })
          }
          executeLabel="Start Watch"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Folder</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} />
            </div>
            <div>
              <Label>Poll Interval (ms)</Label>
              <Input value={pollInterval} onChange={(e) => setPollInterval(e.target.value)} type="number" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopWatch.execute()}
              disabled={stopWatch.loading}
            >
              Stop Watch
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => watchStatus.execute()}
            >
              Check Status
            </Button>
          </div>
        </MethodExecutor>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">
              Event Stream
              <Badge variant="outline" className="ml-2 text-xs">
                {isConnected ? 'SSE Connected' : 'SSE Disconnected'}
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {events.length} events
              </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={clear}>
                <Trash2 className="size-3 mr-1" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No events yet. Start watching or perform actions to see events stream in.
              </p>
            ) : (
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {events.map((evt, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setSelectedEvent(selectedEvent === i ? null : i)
                      }
                      className="w-full text-left flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm"
                    >
                      <Badge className={`text-xs ${eventColor(evt.event)}`} variant="outline">
                        {evt.event}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </button>
                  ))}
                </div>
              </ScrollArea>
            )}
            {selectedEvent !== null && events[selectedEvent] && (
              <div className="mt-4">
                <JsonViewer data={events[selectedEvent]} maxHeight="200px" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
