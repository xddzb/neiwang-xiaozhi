using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
class FusionLauncher {
 [STAThread] static int Main(string[] args) {
  string root=AppDomain.CurrentDomain.BaseDirectory;Directory.SetCurrentDirectory(root);
  Directory.CreateDirectory(Path.Combine(root,"data"));
  try {
   using(FileStream guard=new FileStream(Path.Combine(root,"data","desktop.lock"),FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None)) {
    ProcessStartInfo start=new ProcessStartInfo(Path.Combine(root,"runtime","node","node.exe"),"\""+Path.Combine(root,"launcher","supervisor.cjs")+"\"");
    start.UseShellExecute=false;start.CreateNoWindow=true;start.WorkingDirectory=root;
    using(Process p=Process.Start(start)){p.WaitForExit();if(p.ExitCode!=0)throw new Exception("桌面服务启动或运行失败。请检查是否存在旧进程、端口冲突或安全软件拦截。");}
   }
   return 0;
  }catch(Exception e){MessageBox.Show(e.Message,"内网小智",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
