'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Settings,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Brain,
  Tag,
  FileText,
  PenTool,
  Database,
  ArrowUpDown,
  CheckSquare,
  Search,
  Paperclip,
  Shield,
  Activity,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { ConnectionStatus } from '@/components/playground/connection-status';

const aiSubItems = [
  { title: 'Classify', href: '/ai/classify', icon: Tag },
  { title: 'Summarize', href: '/ai/summarize', icon: FileText },
  { title: 'Compose', href: '/ai/compose', icon: PenTool },
  { title: 'Extract', href: '/ai/extract', icon: Database },
  { title: 'Priority', href: '/ai/priority', icon: ArrowUpDown },
  { title: 'Actions', href: '/ai/actions', icon: CheckSquare },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold">emai</span>
          <span className="text-xs text-muted-foreground">playground</span>
        </div>
        <ConnectionStatus />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/dashboard'}>
                  <Link href="/dashboard">
                    <LayoutDashboard className="size-4" />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/config'}>
                  <Link href="/config">
                    <Settings className="size-4" />
                    <span>Configuration</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Email</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/emails'}>
                  <Link href="/emails">
                    <Mail className="size-4" />
                    <span>Emails</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/threads'}>
                  <Link href="/threads">
                    <MessageSquare className="size-4" />
                    <span>Threads</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>AI</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton>
                  <Brain className="size-4" />
                  <span>AI Features</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {aiSubItems.map((item) => (
                    <SidebarMenuSubItem key={item.href}>
                      <SidebarMenuSubButton
                        asChild
                        isActive={pathname === item.href}
                      >
                        <Link href={item.href}>
                          <item.icon className="size-3" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/search'}>
                  <Link href="/search">
                    <Search className="size-4" />
                    <span>Search</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/attachments'}
                >
                  <Link href="/attachments">
                    <Paperclip className="size-4" />
                    <span>Attachments</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/safety'}>
                  <Link href="/safety">
                    <Shield className="size-4" />
                    <span>Safety</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === '/events'}>
                  <Link href="/events">
                    <Activity className="size-4" />
                    <span>Events & Watch</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
