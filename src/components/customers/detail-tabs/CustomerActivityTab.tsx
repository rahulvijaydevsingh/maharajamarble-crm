import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Plus,
  ArrowUp,
  Loader2
} from 'lucide-react';
import { Customer } from '@/hooks/useCustomers';
import { useActivityLog, ActivityLogEntry } from '@/hooks/useActivityLog';
import { usePermissions } from '@/hooks/usePermissions';
import { ActivityLogFilters } from '@/components/leads/activity/ActivityLogFilters';
import { ActivityLogItem } from '@/components/leads/activity/ActivityLogItem';
import { AddManualActivityDialog } from '@/components/leads/activity/AddManualActivityDialog';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { format, isToday, isYesterday, isThisWeek } from 'date-fns';

interface CustomerActivityTabProps {
  customer: Customer;
}

export function CustomerActivityTab({ customer }: CustomerActivityTabProps) {
  const { activities, loading, hasMore, loadMore, deleteActivity, refetch } = useActivityLog(undefined, customer.id);
  const { role } = usePermissions();
  const isAdmin = role === 'admin' || role === 'super_admin';
  
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [dateGrouping, setDateGrouping] = useState('all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<ActivityLogEntry | null>(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter activities
  const filteredActivities = useMemo(() => {
    let filtered = activities;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.title.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.user_name.toLowerCase().includes(query) ||
        a.activity_type.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(a => selectedCategories.includes(a.activity_category));
    }

    // Date grouping filter
    if (dateGrouping !== 'all') {
      filtered = filtered.filter(a => {
        const date = new Date(a.activity_timestamp);
        switch (dateGrouping) {
          case 'today':
            return isToday(date);
          case 'yesterday':
            return isYesterday(date);
          case 'this_week':
            return isThisWeek(date);
          default:
            return true;
        }
      });
    }

    return filtered;
  }, [activities, searchQuery, selectedCategories, dateGrouping]);

  // Group activities by date
  const groupedActivities = useMemo(() => {
    if (dateGrouping === 'all') {
      return { 'All Activities': filteredActivities };
    }

    const groups: Record<string, ActivityLogEntry[]> = {};
    
    filteredActivities.forEach(activity => {
      const date = new Date(activity.activity_timestamp);
      let key: string;
      
      if (isToday(date)) {
        key = 'Today';
      } else if (isYesterday(date)) {
        key = 'Yesterday';
      } else if (isThisWeek(date)) {
        key = 'This Week';
      } else {
        key = format(date, 'MMMM yyyy');
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(activity);
    });

    return groups;
  }, [filteredActivities, dateGrouping]);

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    setShowBackToTop(container.scrollTop > 300);

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 100 && hasMore && !loading) {
      loadMore();
    }
  }, [hasMore, loading, loadMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async () => {
    if (activityToDelete) {
      await deleteActivity(activityToDelete.id);
      setActivityToDelete(null);
    }
  };

  // Check if user can add manual entries (admin or granted permission)
  const canAddManualEntry = isAdmin; // Can be extended with role-based settings

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">Activity Log</h3>
        {canAddManualEntry && (
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Activity
          </Button>
        )}
      </div>

      {/* Filters */}
      <ActivityLogFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        dateGrouping={dateGrouping}
        onDateGroupingChange={setDateGrouping}
        selectedCategories={selectedCategories}
        onCategoriesChange={setSelectedCategories}
      />

      {/* Activity List */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto mt-4 pr-2"
        style={{ maxHeight: 'calc(100vh - 400px)', minHeight: '300px' }}
      >
        {loading && activities.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activities found.</p>
            {(searchQuery || selectedCategories.length > 0) && (
              <p className="text-sm mt-2">Try adjusting your filters.</p>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

            {Object.entries(groupedActivities).map(([groupName, groupActivities]) => (
              <div key={groupName} className="space-y-6">
                {dateGrouping !== 'all' && groupName !== 'All Activities' && (
                  <div className="sticky top-0 z-10 bg-background py-2">
                    <h4 className="text-sm font-semibold text-muted-foreground border-b pb-2">
                      {groupName}
                    </h4>
                  </div>
                )}
                
                <div className="space-y-6">
                  {groupActivities.map((activity) => (
                    <ActivityLogItem
                      key={activity.id}
                      activity={activity}
                      isAdmin={isAdmin}
                      onEdit={() => {/* TODO: Implement edit dialog */}}
                      onDelete={setActivityToDelete}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Load more indicator */}
            {loading && activities.length > 0 && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Loading more...</span>
              </div>
            )}

            {!hasMore && activities.length > 0 && (
              <div className="text-center py-4 text-sm text-muted-foreground">
                All activities loaded ✓
              </div>
            )}
          </div>
        )}

        {/* Back to top button */}
        {showBackToTop && (
          <Button
            variant="outline"
            size="sm"
            className="fixed bottom-4 right-4 shadow-lg"
            onClick={scrollToTop}
          >
            <ArrowUp className="h-4 w-4 mr-1" />
            Back to Top
          </Button>
        )}
      </div>

      {/* Add Manual Activity Dialog - uses customerId prop */}
      <AddManualActivityDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        leadId={customer.id}
        customerId={customer.id}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!activityToDelete} onOpenChange={() => setActivityToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Activity Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this activity entry? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
