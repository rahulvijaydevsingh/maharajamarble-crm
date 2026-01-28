
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-marble-pattern">
      <div className="text-center max-w-md px-4">
        <h1 className="text-6xl font-bold text-marble-primary mb-4">404</h1>
        <p className="text-xl text-marble-primary mb-6">
          The page you're looking for couldn't be found.
        </p>
        <Button 
          className="bg-marble-accent text-marble-primary hover:bg-marble-accent/90"
          onClick={() => window.location.href = "/"}
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
