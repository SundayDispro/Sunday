' Arranque invisible al iniciar sesión. Copia este archivo a la carpeta Inicio (shell:startup) si no usas la tarea programada como administrador.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""C:\Users\PC\Documents\Sunday\scripts\start-sunday-at-boot.ps1""", 0, False
