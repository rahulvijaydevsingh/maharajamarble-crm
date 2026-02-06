
import React from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Bell,
  Building,
  Clock,
  Mail,
  Phone,
  Save,
  Shield,
  User,
  Users,
  Loader2,
  CheckCircle,
  HeartHandshake,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ControlPanel } from "@/components/settings/ControlPanel";
import { RoleManagementPanel } from "@/components/settings/RoleManagementPanel";
import { StaffManagementPanel } from "@/components/settings/StaffManagementPanel";
import { BackupRestorePanel } from "@/components/settings/BackupRestorePanel";
import { KitPresetList } from "@/components/kit/presets/KitPresetList";
import { useActiveStaff } from "@/hooks/useActiveStaff";
import { useProfileSettings } from "@/hooks/useProfileSettings";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format } from "date-fns";

const Settings = () => {
  const { staffMembers } = useActiveStaff();
  const { 
    profileData, 
    setProfileData, 
    loading: profileLoading, 
    saving: profileSaving, 
    lastSaved: profileLastSaved,
    saveProfile 
  } = useProfileSettings();
  
  const { 
    companyData, 
    setCompanyData, 
    loading: companyLoading, 
    saving: companySaving, 
    lastSaved: companyLastSaved,
    saveCompanySettings 
  } = useCompanySettings();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-bold text-marble-primary mb-1">Settings</h1>
          <p className="text-muted-foreground">
            Manage your account and system preferences
          </p>
        </div>

          <Tabs defaultValue="profile" className="w-full">
          	<TabsList className="grid grid-cols-9 md:w-[1200px]">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="roles">Roles</TabsTrigger>
            <TabsTrigger value="control-panel">Control Panel</TabsTrigger>
            <TabsTrigger value="kit">
              <HeartHandshake className="h-4 w-4 mr-1" />
              KIT
            </TabsTrigger>
	            <TabsTrigger value="backup-restore">Backup</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col gap-4 items-center sm:flex-row">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src="" />
                    <AvatarFallback className="bg-marble-primary text-marble-light text-3xl">
                      {profileData.firstName.charAt(0)}{profileData.lastName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline">Upload New Photo</Button>
                    <p className="text-xs text-muted-foreground">
                      JPG, GIF or PNG. Max size of 800K
                    </p>
                  </div>
                </div>
                
                <Separator />
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName" 
                      value={profileData.firstName} 
                      onChange={(e) => setProfileData({...profileData, firstName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                      id="lastName" 
                      value={profileData.lastName} 
                      onChange={(e) => setProfileData({...profileData, lastName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      value={profileData.email} 
                      onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      type="tel" 
                      value={profileData.phone} 
                      onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {profileLastSaved && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Last saved: {format(profileLastSaved, "PPp")}
                    </span>
                  )}
                </div>
                <Button 
                  onClick={saveProfile} 
                  disabled={profileSaving || profileLoading}
                  className="ml-auto"
                >
                  {profileSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="company" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>
                  Update your company details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input 
                    id="companyName" 
                    value={companyData.name} 
                    onChange={(e) => setCompanyData({...companyData, name: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input 
                    id="address" 
                    value={companyData.address} 
                    onChange={(e) => setCompanyData({...companyData, address: e.target.value})}
                  />
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input 
                      id="city" 
                      value={companyData.city} 
                      onChange={(e) => setCompanyData({...companyData, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input 
                      id="state" 
                      value={companyData.state} 
                      onChange={(e) => setCompanyData({...companyData, state: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pincode">PIN Code</Label>
                    <Input 
                      id="pincode" 
                      value={companyData.pincode} 
                      onChange={(e) => setCompanyData({...companyData, pincode: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="companyPhone">Phone Number</Label>
                    <Input 
                      id="companyPhone" 
                      value={companyData.phone} 
                      onChange={(e) => setCompanyData({...companyData, phone: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="companyEmail">Email Address</Label>
                    <Input 
                      id="companyEmail" 
                      value={companyData.email} 
                      onChange={(e) => setCompanyData({...companyData, email: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input 
                      id="website" 
                      value={companyData.website} 
                      onChange={(e) => setCompanyData({...companyData, website: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input 
                      id="gstin" 
                      value={companyData.gstin} 
                      onChange={(e) => setCompanyData({...companyData, gstin: e.target.value})}
                    />
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {companyLastSaved && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Last saved: {format(companyLastSaved, "PPp")}
                    </span>
                  )}
                </div>
                <Button 
                  onClick={saveCompanySettings} 
                  disabled={companySaving || companyLoading}
                  className="ml-auto"
                >
                  {companySaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Save Company Info
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="system" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>
                  Configure general system preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Bell className="mr-2 h-5 w-5" />
                    Notification Settings
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Email Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Receive daily summary of activities
                        </p>
                      </div>
                      <Switch id="email-notif" defaultChecked />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Desktop Notifications</p>
                        <p className="text-sm text-muted-foreground">
                          Get notifications for important events
                        </p>
                      </div>
                      <Switch id="desktop-notif" defaultChecked />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Task Reminders</p>
                        <p className="text-sm text-muted-foreground">
                          Notify before task due dates
                        </p>
                      </div>
                      <Select defaultValue="1h">
                        <SelectTrigger className="w-28">
                          <SelectValue placeholder="Reminder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30m">30 minutes</SelectItem>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="3h">3 hours</SelectItem>
                          <SelectItem value="1d">1 day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Clock className="mr-2 h-5 w-5" />
                    Date & Time Settings
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="timezone">Timezone</Label>
                        <Select defaultValue="IST">
                          <SelectTrigger id="timezone">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IST">India Standard Time (IST)</SelectItem>
                            <SelectItem value="UTC">Coordinated Universal Time (UTC)</SelectItem>
                            <SelectItem value="EST">Eastern Standard Time (EST)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dateFormat">Date Format</Label>
                        <Select defaultValue="DD-MM-YYYY">
                          <SelectTrigger id="dateFormat">
                            <SelectValue placeholder="Select date format" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                            <SelectItem value="MM-DD-YYYY">MM-DD-YYYY</SelectItem>
                            <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Users className="mr-2 h-5 w-5" />
                    Default Assignment Settings
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="defaultAssignee">Default Task Assignee</Label>
                      <Select defaultValue="admin">
                        <SelectTrigger id="defaultAssignee">
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin User</SelectItem>
                          {staffMembers.map((member) => (
                            <SelectItem key={member.id} value={member.name}>{member.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-assign New Leads</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically assign new leads to team members
                        </p>
                      </div>
                      <Switch id="auto-assign" />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="ml-auto">
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="security" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>
                  Manage your account security preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center">
                    <Shield className="mr-2 h-5 w-5" />
                    Password Management
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input id="currentPassword" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input id="newPassword" type="password" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input id="confirmPassword" type="password" />
                      </div>
                    </div>
                    
                    <div className="pt-2">
                      <Button>Change Password</Button>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Session Management</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto Logout</p>
                        <p className="text-sm text-muted-foreground">
                          Automatically log out after period of inactivity
                        </p>
                      </div>
                      <Select defaultValue="30m">
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Select timeout" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15m">15 minutes</SelectItem>
                          <SelectItem value="30m">30 minutes</SelectItem>
                          <SelectItem value="1h">1 hour</SelectItem>
                          <SelectItem value="4h">4 hours</SelectItem>
                          <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="pt-2">
                      <Button variant="outline">Sign Out from All Devices</Button>
                    </div>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Two-Factor Authentication</h3>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Enable 2FA</p>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Switch id="enable-2fa" />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="ml-auto">
                  <Save className="mr-2 h-4 w-4" />
                  Save Security Settings
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          
          <TabsContent value="staff" className="space-y-4 mt-4">
            <StaffManagementPanel />
          </TabsContent>
          
          <TabsContent value="roles" className="space-y-4 mt-4">
            <RoleManagementPanel />
          </TabsContent>
          
          <TabsContent value="control-panel" className="space-y-4 mt-4">
            <ControlPanel />
          </TabsContent>

          <TabsContent value="kit" className="space-y-4 mt-4">
            <KitPresetList />
          </TabsContent>

          <TabsContent value="backup-restore" className="space-y-4 mt-4">
            <BackupRestorePanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Settings;
