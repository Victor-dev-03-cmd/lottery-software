/**
 * Iconsax icon exports — single import point for the design system.
 *
 * All Iconsax icons accept:
 *   size?: number | string   (default: 24)
 *   color?: string
 *   variant?: "Linear" | "Outline" | "Broken" | "Bold" | "Bulk" | "TwoTone"
 *   className?: string
 *
 * Design system sizes:
 *   sm = 16   (compact table actions, inline badges)
 *   md = 20   (standard nav items, buttons — DEFAULT)
 *   lg = 24   (large actions, hero icons)
 *
 * Lucide → Iconsax migration map (replace as each component is modernised):
 *
 *   Lucide LayoutDashboard  → Category2
 *   Lucide FileText         → DocumentText
 *   Lucide PlusCircle       → AddCircle
 *   Lucide Users            → People
 *   Lucide BarChart2        → Chart21
 *   Lucide Settings         → Setting2
 *   Lucide ChevronLeft      → ArrowLeft2
 *   Lucide ChevronRight     → ArrowRight2
 *   Lucide Ticket           → Tag
 *   Lucide RotateCcw        → RotateLeft
 *   Lucide ClipboardList    → ClipboardText
 *   Lucide Percent          → PercentageCircle
 *   Lucide Bell             → Notification
 *   Lucide Trophy           → Cup
 *   Lucide ShoppingCart     → ShoppingCart
 *   Lucide TrendingUp       → TrendUp
 *   Lucide Network          → Hierarchy
 *   Lucide Brain            → Cpu
 *   Lucide Printer          → Printer
 *   Lucide UserCog          → UserEdit
 *   Lucide Warehouse        → House
 *   Lucide HandCoins        → Money3
 *   Lucide FileClock        → Clock
 *   Lucide FileCheck        → DocumentFilter
 *   Lucide FileX            → ClipboardClose
 *   Lucide Palette          → Brush
 *   Lucide BookOpen         → Book1
 *   Lucide Wallet           → Wallet
 *   Lucide AlertTriangle    → Warning2
 *   Lucide CheckCircle      → TickCircle
 *   Lucide ShieldCheck      → ShieldTick
 *   Lucide Search           → SearchNormal1
 *   Lucide X                → CloseCircle
 *   Lucide Plus             → Add
 *   Lucide Pencil           → Edit2
 *   Lucide Trash2           → Trash
 *   Lucide Save             → Save2
 *   Lucide Download         → ImportCurve
 *   Lucide Download         → ExportCurve
 *   Lucide Eye              → Eye
 *   Lucide EyeOff           → EyeSlash
 *   Lucide RefreshCw        → Refresh2
 *   Lucide ArrowLeft        → ArrowLeft
 *   Lucide DollarSign       → DollarCircle
 *   Lucide CreditCard       → Card
 *   Lucide Package          → Box1
 *   Lucide LogIn            → Login
 *   Lucide Lock             → Lock1
 *   Lucide Home             → Home2
 *   Lucide Building2        → Buildings2
 *   Lucide ExternalLink     → Export3
 *   Lucide Delete           → Backspace
 *   Lucide Calculator       → Calculator  (same name)
 *   Lucide ChevronDown      → ArrowDown2
 *   Lucide FolderOpen       → FolderOpen
 *   Lucide Zap              → Flash
 *   Lucide Sparkles         → Stars
 *   Lucide MessageCircle    → Messages2
 *   Lucide HardDrive        → HardDrive (unavailable → keep Lucide)
 *   Lucide Grid             → Grid2
 *   Lucide List             → Textalign
 *   Lucide Image            → GalleryAdd
 *   Lucide Thermometer      → (no equivalent → keep Lucide)
 *
 * Migration happens progressively during Phases 2–6 component updates.
 * This file is the single source of truth for icon selection decisions.
 */

export {
  Category2,
  DocumentText,
  AddCircle,
  People,
  Chart21,
  Setting2,
  ArrowLeft2,
  ArrowRight2,
  ArrowLeft,
  ArrowDown2,
  ArrowUp,
  Tag,
  RotateLeft,
  ClipboardText,
  PercentageCircle,
  Notification,
  Cup,
  ShoppingCart,
  TrendUp,
  TrendDown,
  Hierarchy,
  Cpu,
  Printer,
  UserEdit,
  House,
  Money3,
  Clock,
  DocumentFilter,
  ClipboardClose,
  Brush,
  Book1,
  Wallet,
  Warning2,
  TickCircle,
  CloseCircle,
  ShieldTick,
  SearchNormal1,
  Add,
  Edit2,
  Trash,
  Save2,
  ImportCurve,
  ExportCurve,
  Eye,
  EyeSlash,
  Refresh2,
  DollarCircle,
  Card,
  Box1,
  Login,
  Lock1,
  Home2,
  Buildings2,
  ExportCircle,
  Back,
  Calculator,
  FolderOpen,
  Flash,
  Star1,
  Messages2,
  Grid2,
  AlignLeft,
  GalleryAdd,
  Moneys,
  ReceiptItem,
  DocumentUpload,
  DocumentDownload,
  Chart,
  Profile2User,
  UserSquare,
  InfoCircle,
  CloseSquare,
  Maximize2,
  More,
  MoreCircle,
} from "iconsax-react";
