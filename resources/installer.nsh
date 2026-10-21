!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "Tabi"
  DeleteRegValue HKCU "Software\Classes\.htm\OpenWithProgIds" "Tabi"
  DeleteRegValue HKCU "Software\Classes\.html\OpenWithProgIds" "Tabi"
  DeleteRegKey HKCU "Software\Classes\Tabi"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\Tabi"
!macroend
