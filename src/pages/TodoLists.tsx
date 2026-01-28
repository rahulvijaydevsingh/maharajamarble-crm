import React, { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { TodoListsView } from "@/components/todos/TodoListsView";
import { AddTodoListDialog } from "@/components/todos/AddTodoListDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, ListTodo, LayoutGrid, List } from "lucide-react";

const TodoLists = () => {
  const [addListDialogOpen, setAddListDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1 flex items-center gap-2">
              <ListTodo className="h-8 w-8" />
              To-Do Lists
            </h1>
            <p className="text-muted-foreground">
              Quick task capture and organization before formalizing into tasks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "cards" | "list")}>
              <TabsList>
                <TabsTrigger value="cards" className="gap-1">
                  <LayoutGrid className="h-4 w-4" />
                  Cards
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1">
                  <List className="h-4 w-4" />
                  List
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => setAddListDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New List
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Your To-Do Lists</CardTitle>
            <CardDescription>
              Create lists, add items, and convert them to full tasks when ready
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TodoListsView viewMode={viewMode} />
          </CardContent>
        </Card>

        <AddTodoListDialog
          open={addListDialogOpen}
          onOpenChange={setAddListDialogOpen}
        />
      </div>
    </DashboardLayout>
  );
};

export default TodoLists;
