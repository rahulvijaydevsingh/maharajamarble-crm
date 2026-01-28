import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Plus, StickyNote, User, Calendar } from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';
import { useActivityLog } from '@/hooks/useActivityLog';
import { format } from 'date-fns';

interface CustomerNotesTabProps {
  customer: Customer;
}

export function CustomerNotesTab({ customer }: CustomerNotesTabProps) {
  const { activities, createActivity } = useActivityLog(undefined, customer.id);
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const noteActivities = activities.filter(a => a.activity_type === 'note_added');

  const handleAddNote = async () => {
    if (!newNote.trim()) return;

    try {
      await createActivity({
        customer_id: customer.id,
        activity_type: 'note_added',
        activity_category: 'note',
        title: 'Note Added',
        description: newNote.trim(),
        is_manual: true,
      });
      setNewNote('');
      setIsAdding(false);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Notes ({noteActivities.length})</h3>
        {!isAdding && (
          <Button size="sm" onClick={() => setIsAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Note
          </Button>
        )}
      </div>

      {isAdding && (
        <Card>
          <CardContent className="py-4">
            <Textarea
              placeholder="Enter your note..."
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2 mt-3">
              <Button variant="outline" onClick={() => { setIsAdding(false); setNewNote(''); }}>
                Cancel
              </Button>
              <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                Save Note
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {noteActivities.length === 0 && !isAdding ? (
        <Card>
          <CardContent className="py-12 text-center">
            <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No notes yet</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsAdding(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add First Note
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {noteActivities.map((note) => (
            <Card key={note.id}>
              <CardContent className="py-4">
                <p className="whitespace-pre-wrap">{note.description}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {note.user_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(note.activity_timestamp), 'PPP p')}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
