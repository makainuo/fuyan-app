using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class WindowIdentity {
    [StructLayout(LayoutKind.Sequential)] public struct PropertyKey {
        public Guid format; public uint id;
        public PropertyKey(uint value) { format=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"); id=value; }
    }
    [StructLayout(LayoutKind.Explicit, Size=24)] public struct PropertyValue {
        [FieldOffset(0)] public ushort type;
        [FieldOffset(8)] public IntPtr text;
    }
    [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface PropertyStore {
        [PreserveSig] int GetCount(out uint count);
        [PreserveSig] int GetAt(uint index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropertyValue value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropertyValue value);
        [PreserveSig] int Commit();
    }
    [DllImport("shell32.dll")] static extern int SHGetPropertyStoreForWindow(IntPtr window, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out PropertyStore store);
    [DllImport("shell32.dll", CharSet=CharSet.Unicode)] static extern int SHGetPropertyStoreFromParsingName(string name, IntPtr context, uint flags, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out PropertyStore store);
    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropertyValue value);
    static readonly Guid StoreId=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    const string AppId="ZaiLao.App";

    static void Set(PropertyStore store, uint id, string text) {
        PropertyKey key=new PropertyKey(id);
        PropertyValue value=new PropertyValue(); value.type=31; value.text=Marshal.StringToCoTaskMemUni(text);
        try { Marshal.ThrowExceptionForHR(store.SetValue(ref key,ref value)); }
        finally { Marshal.FreeCoTaskMem(value.text); }
    }
    static string Get(PropertyStore store,uint id) {
        PropertyKey key=new PropertyKey(id); PropertyValue value;
        Marshal.ThrowExceptionForHR(store.GetValue(ref key,out value));
        try { return value.type==31 ? Marshal.PtrToStringUni(value.text) : ""; }
        finally { PropVariantClear(ref value); }
    }
    static PropertyStore ForWindow(IntPtr window) {
        Guid iid=StoreId; PropertyStore store;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(window,ref iid,out store)); return store;
    }
    public static void Apply(IntPtr window,string icon,string launcher,string title) {
        if(!File.Exists(icon)||!File.Exists(launcher)) throw new FileNotFoundException("Missing app branding resource");
        PropertyStore store=ForWindow(window);
        try {
            Set(store,2,"\""+Path.Combine(Environment.SystemDirectory,"wscript.exe")+"\" \""+launcher+"\"");
            Set(store,3,icon+",0"); Set(store,4,title); Set(store,5,AppId);
            // Window property stores apply immediately; they do not support Commit.
        } finally { Marshal.ReleaseComObject(store); }
        // The shell loads its own icon from the resource file. Avoid passing HICON
        // handles owned by this short-lived helper: they die when it exits.
    }
    public static void ApplyShortcut(string shortcut) {
        if(!File.Exists(shortcut)) return;
        Guid iid=StoreId; PropertyStore store;
        Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(shortcut,IntPtr.Zero,2,ref iid,out store));
        try { Set(store,5,AppId); Marshal.ThrowExceptionForHR(store.Commit()); }
        finally { Marshal.ReleaseComObject(store); }
    }
    public static string Inspect(IntPtr window) {
        PropertyStore store=ForWindow(window);
        try { return Get(store,5)+" | "+Get(store,3); }
        finally { Marshal.ReleaseComObject(store); }
    }
}
