import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function Header() {
  return <header className="sticky top-0 z-50 border-b border-foreground/10 bg-background/90 backdrop-blur-md"><div className="container flex h-16 items-center justify-between"><Link to="/" className="flex items-center gap-3"><span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-foreground p-0.5"><img src="/favicon.svg" alt="Hili logo" className="relative z-10 h-full w-full object-contain" /><span className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold text-background">H</span></span><span className="font-display text-lg font-bold tracking-tight">Hili<span className="text-primary">.</span></span></Link><div className="hidden md:block"><Button asChild size="sm"><Link to="/contact">Get in touch</Link></Button></div><Sheet><SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden"><Menu className="h-5 w-5" /></Button></SheetTrigger><SheetContent side="right" className="w-72"><div className="mt-10"><Button asChild className="w-full"><Link to="/contact">Get in touch</Link></Button></div></SheetContent></Sheet></div></header>;
}
